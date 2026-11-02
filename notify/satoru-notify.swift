// Desktop Satoru for macOS. Built and launched by the mod:
//   swiftc -O -o bin/satoru-notify notify/satoru-notify.swift
//   satoru-notify -watch <sessions folder>
import AppKit
import WebKit

let PURPLE = NSColor(srgbRed: 0.56, green: 0.33, blue: 0.96, alpha: 1)

struct Options {
  var watch: URL?
}

func parse() -> Options {
  var options = Options()
  var args = CommandLine.arguments.dropFirst().makeIterator()
  while let flag = args.next(), let value = args.next() {
    switch flag {
    case "-watch": options.watch = URL(fileURLWithPath: value).standardizedFileURL
    default: break
    }
  }
  return options
}

// A state file older than this belongs to a closed conversation
let STALE_SECONDS = 12.0
// Quits after this long with no open conversation
let ALONE_SECONDS = 20.0
// The band is 66 × 30 pixels of 4 px plus a 24 px word line
let DESK_ZOOM: CGFloat = 0.75
let DESK_SIZE = NSSize(width: 66 * 4 * DESK_ZOOM, height: (30 * 4 + 24) * DESK_ZOOM)
let HEAD_X: CGFloat = 16 * 4 * DESK_ZOOM
let BUBBLE_TAIL: CGFloat = 10
let BUBBLE_TAIL_X: CGFloat = 18
let DESK_ORIGIN_KEY = "deskOrigin"
let DESK_HIDDEN_KEY = "deskHidden"
let CLAUDE_APP = "com.anthropic.claudefordesktop"
let BUBBLE_WIDTH = DESK_SIZE.width
let BUBBLE_MIN_WIDTH: CGFloat = 80
let BUBBLE_TAIL_MARGIN: CGFloat = 16
let STATES = ["working", "done", "idle"]

struct Session {
  let id: String
  let state: String
  let host: String?
  let line: String?
  let band: URL
  let bandModified: Date
}

/** Draggable; click opens the conversation, right-click hides him. */
final class DeskView: NSView {
  var onClick: () -> Void = {}
  var onMoved: () -> Void = {}
  let outline = Outline()
  private var start = NSPoint.zero
  private var origin = NSPoint.zero
  private var isDragging = false

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // Otherwise the web view takes clicks and drags
  override func hitTest(_ point: NSPoint) -> NSView? { frame.contains(point) ? self : nil }

  override func mouseDown(with event: NSEvent) {
    start = NSEvent.mouseLocation
    origin = window?.frame.origin ?? .zero
    isDragging = false
    outline.isHidden = false
  }

  override func mouseDragged(with event: NSEvent) {
    let now = NSEvent.mouseLocation
    if !isDragging && hypot(now.x - start.x, now.y - start.y) < 3 { return }
    isDragging = true
    window?.setFrameOrigin(NSPoint(x: origin.x + now.x - start.x, y: origin.y + now.y - start.y))
  }

  override func mouseUp(with event: NSEvent) {
    outline.isHidden = true
    if isDragging { onMoved() } else { onClick() }
  }
}

/** Dashed edge shown while dragging. */
final class Outline: NSView {
  override init(frame: NSRect) {
    super.init(frame: frame)
    isHidden = true
  }

  required init?(coder: NSCoder) { nil }

  override func draw(_ dirtyRect: NSRect) {
    let edge = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 10, yRadius: 10)
    PURPLE.withAlphaComponent(0.85).setStroke()
    edge.lineWidth = 1.5
    edge.setLineDash([6, 4], count: 2, phase: 0)
    edge.stroke()
  }
}

/** Comic balloon pointing at his head. */
final class Balloon: NSView {
  var onClick: () -> Void = {}
  var tailX = BUBBLE_TAIL_X { didSet { needsDisplay = true } }
  private let label: NSTextField

  init(text: String) {
    label = NSTextField(wrappingLabelWithString: text)
    label.font = .systemFont(ofSize: 12, weight: .medium)
    label.textColor = NSColor(srgbRed: 0.04, green: 0.04, blue: 0.06, alpha: 1)
    label.maximumNumberOfLines = 4
    label.preferredMaxLayoutWidth = BUBBLE_WIDTH - 24
    let text = label.fittingSize
    super.init(frame: NSRect(x: 0, y: 0, width: max(text.width + 24, BUBBLE_MIN_WIDTH), height: text.height + 16 + BUBBLE_TAIL))
    label.frame = NSRect(x: 12, y: BUBBLE_TAIL + 8, width: text.width, height: text.height)
    addSubview(label)
  }

  required init?(coder: NSCoder) { nil }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // Otherwise the label takes the click
  override func hitTest(_ point: NSPoint) -> NSView? { frame.contains(point) ? self : nil }
  override func mouseUp(with event: NSEvent) { onClick() }

  override func draw(_ dirtyRect: NSRect) {
    let body = NSRect(x: 1, y: BUBBLE_TAIL, width: bounds.width - 2, height: bounds.height - BUBBLE_TAIL - 1)
    let shape = NSBezierPath(roundedRect: body, xRadius: 10, yRadius: 10)
    let tail = NSBezierPath()
    tail.move(to: NSPoint(x: tailX - 6, y: BUBBLE_TAIL + 1))
    tail.line(to: NSPoint(x: tailX, y: 1))
    tail.line(to: NSPoint(x: tailX + 8, y: BUBBLE_TAIL + 1))
    tail.close()
    shape.append(tail)
    NSColor.white.setFill()
    shape.fill()
    NSColor(srgbRed: 0.04, green: 0.04, blue: 0.06, alpha: 1).setStroke()
    shape.lineWidth = 2
    shape.stroke()
    // Hide the seam between tail and body
    NSColor.white.setFill()
    NSRect(x: tailX - 5, y: BUBBLE_TAIL - 1, width: 12, height: 3).fill()
  }
}

/**
 * Shows the band of the most relevant open conversation: an unseen finish, else one working, else the latest.
 * Hidden while Claude is in front.
 */
@MainActor
final class Desk: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  let dir: URL
  var panel: NSPanel!
  var web: WKWebView!
  // A band set before the page loads is lost
  var isWebReady = false
  var bubble: NSPanel?
  var bubbleFor: String?
  var shown: Session?
  var lastSeen = Date()
  var latestDone: Session?
  // Done until the next prompt; seen once Claude has been in front
  var doneNow = Set<String>()
  var doneSeen = Set<String>()
  var doneSince: [String: Date] = [:]
  var isHiddenByYou = UserDefaults.standard.bool(forKey: DESK_HIDDEN_KEY)
  var menuBarItem: NSStatusItem?

  init(dir: URL) { self.dir = dir }

  func applicationDidFinishLaunching(_ notification: Notification) {
    let desk = DeskView(frame: NSRect(origin: .zero, size: DESK_SIZE))
    desk.onClick = { [weak self] in self?.open() }
    desk.onMoved = { [weak self] in self?.keepOrigin() }
    let menu = NSMenu()
    let hide = NSMenuItem(title: "Ocultar a Satoru", action: #selector(hideSatoru), keyEquivalent: "")
    hide.target = self
    menu.addItem(hide)
    desk.menu = menu

    // Transparent, so clicks pass through the empty part
    web = WKWebView(frame: desk.bounds)
    web.setValue(false, forKey: "drawsBackground")
    web.navigationDelegate = self
    web.loadHTMLString("<html><head><style>html,body{margin:0;overflow:hidden;background:transparent}body{zoom:\(DESK_ZOOM)}</style></head><body></body></html>", baseURL: nil)
    desk.addSubview(web)
    desk.outline.frame = desk.bounds
    desk.addSubview(desk.outline)

    panel = NSPanel(contentRect: NSRect(origin: savedOrigin(), size: DESK_SIZE), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    float(panel)
    panel.contentView = desk

    let workspace = NSWorkspace.shared.notificationCenter
    workspace.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
      let front = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
      MainActor.assumeIsolated { self?.show(isClaudeInFront: front?.bundleIdentifier == CLAUDE_APP) }
    }
    show(isClaudeInFront: isClaudeInFront())

    Task { [weak self] in
      while let self {
        self.poll()
        try? await Task.sleep(for: .seconds(1))
      }
    }
  }

  func float(_ panel: NSPanel) {
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.isFloatingPanel = true
    panel.hidesOnDeactivate = false
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
  }

  func isClaudeInFront() -> Bool { NSWorkspace.shared.frontmostApplication?.bundleIdentifier == CLAUDE_APP }

  func show(isClaudeInFront: Bool) {
    if isClaudeInFront { doneSeen.formUnion(doneNow) }
    if isClaudeInFront || isHiddenByYou {
      panel.orderOut(nil)
      hideBubble()
    } else {
      panel.orderFrontRegardless()
      bubble?.orderFrontRegardless()
    }
    waitInMenuBar(isHiddenByYou)
  }

  /** ∞ in the menu bar while hidden, ∞✓ after a finish. */
  func waitInMenuBar(_ isWaiting: Bool) {
    guard isWaiting else {
      if let menuBarItem { NSStatusBar.system.removeStatusItem(menuBarItem) }
      menuBarItem = nil
      return
    }
    if menuBarItem == nil {
      let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
      item.button?.target = self
      item.button?.action = #selector(showSatoru)
      item.button?.toolTip = "Mostrar a Satoru"
      menuBarItem = item
    }
    menuBarItem?.button?.title = latestDone == nil ? "∞" : "∞✓"
  }

  func poll() {
    let now = Date()
    let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
    let modified = { (url: URL) in try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate }
    let sessions: [Session] = files.filter { $0.pathExtension == "json" }.compactMap { url in
      let band = url.deletingPathExtension().appendingPathExtension("svg")
      guard let written = modified(url), now.timeIntervalSince(written) < STALE_SECONDS,
            let bandModified = modified(band),
            let data = try? Data(contentsOf: url),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let state = json["state"] as? String, STATES.contains(state) else { return nil }

      return Session(
        id: url.lastPathComponent, state: state, host: json["host"] as? String,
        line: json["line"] as? String, band: band, bandModified: bandModified
      )
    }
    if sessions.isEmpty {
      if now.timeIntervalSince(lastSeen) > ALONE_SECONDS { NSApp.terminate(nil) }
      return
    }
    lastSeen = now

    let finished = sessions.filter { $0.state == "done" }
    doneNow = Set(finished.map(\.id))
    // A finish you watched happen is already seen
    doneSeen.formIntersection(doneNow)
    doneSince = doneSince.filter { doneNow.contains($0.key) }
    for session in finished where doneSince[session.id] == nil { doneSince[session.id] = now }
    if isClaudeInFront() { doneSeen.formUnion(doneNow) }
    latestDone = finished.filter { !doneSeen.contains($0.id) }.max { doneSince[$0.id]! < doneSince[$1.id]! }

    let newest = { (a: Session, b: Session) in a.bandModified < b.bandModified }
    let next = latestDone ?? sessions.filter { $0.state == "working" }.max(by: newest) ?? sessions.max(by: newest)!
    if next.id != shown?.id || next.bandModified != shown?.bandModified { draw(next) }

    if isHiddenByYou {
      waitInMenuBar(true)
    } else if let done = latestDone, let line = done.line {
      if bubbleFor != done.id { say(line, for: done.id) }
    } else {
      hideBubble()
    }
  }

  func draw(_ session: Session) {
    shown = session
    guard isWebReady, let svg = try? String(contentsOf: session.band, encoding: .utf8),
          let literal = try? String(data: JSONEncoder().encode(svg), encoding: .utf8) else { return }
    web.evaluateJavaScript("document.body.innerHTML = \(literal)")
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    isWebReady = true
    if let shown { draw(shown) }
  }

  func say(_ text: String, for id: String) {
    hideBubble()
    bubbleFor = id
    let balloon = Balloon(text: text)
    balloon.onClick = { [weak self] in self?.open() }
    let next = NSPanel(contentRect: NSRect(origin: .zero, size: balloon.frame.size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    float(next)
    next.contentView = balloon
    bubble = next
    placeBalloon()
    if !isClaudeInFront() { next.orderFrontRegardless() }
  }

  /** Keeps the balloon on screen, its tail still pointing at him. */
  func placeBalloon() {
    guard let bubble, let balloon = bubble.contentView as? Balloon else { return }
    let desk = panel.frame
    let size = bubble.frame.size
    let area = (panel.screen ?? NSScreen.main ?? NSScreen.screens[0]).visibleFrame
    let head = desk.minX + HEAD_X + 6
    let x = min(max(desk.minX, area.minX), area.maxX - size.width)
    let y = min(desk.maxY - 4, area.maxY - size.height)
    bubble.setFrameOrigin(NSPoint(x: x, y: y))
    balloon.tailX = min(max(head - x, BUBBLE_TAIL_MARGIN), size.width - BUBBLE_TAIL_MARGIN)
  }

  func hideBubble() {
    bubble?.orderOut(nil)
    bubble = nil
    bubbleFor = nil
  }

  /** Opens the latest finished conversation, else the shown one, else Claude. */
  func open() {
    if let host = (latestDone ?? shown)?.host, let url = URL(string: "claude://code/continue?session=\(host)") {
      NSWorkspace.shared.open(url)
      return
    }
    guard let app = NSWorkspace.shared.urlForApplication(withBundleIdentifier: CLAUDE_APP) else { return }
    NSWorkspace.shared.openApplication(at: app, configuration: NSWorkspace.OpenConfiguration())
  }

  @objc func hideSatoru() { setHidden(true) }

  @objc func showSatoru() { setHidden(false) }

  func setHidden(_ isHidden: Bool) {
    isHiddenByYou = isHidden
    UserDefaults.standard.set(isHidden, forKey: DESK_HIDDEN_KEY)
    show(isClaudeInFront: isClaudeInFront())
  }

  func keepOrigin() {
    UserDefaults.standard.set(NSStringFromPoint(panel.frame.origin), forKey: DESK_ORIGIN_KEY)
    placeBalloon()
  }

  /** The saved position if still on screen, else bottom right. */
  func savedOrigin() -> NSPoint {
    if let saved = UserDefaults.standard.string(forKey: DESK_ORIGIN_KEY) {
      let origin = NSPointFromString(saved)
      let center = NSPoint(x: origin.x + DESK_SIZE.width / 2, y: origin.y + DESK_SIZE.height / 2)
      if NSScreen.screens.contains(where: { NSMouseInRect(center, $0.frame, false) }) { return origin }
    }
    let area = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame

    return NSPoint(x: area.maxX - DESK_SIZE.width - 24, y: area.minY + 24)
  }
}

/** Only one instance runs; later launches exit. */
func holdDeskLock(in dir: URL) {
  try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  let fd = open(dir.appendingPathComponent(".desk.lock").path, O_CREAT | O_RDWR, 0o644)
  if fd < 0 || flock(fd, LOCK_EX | LOCK_NB) != 0 { exit(0) }
}

// Swift 5 doesn't treat top-level code as the main actor
MainActor.assumeIsolated {
  let options = parse()
  let app = NSApplication.shared
  // NSApplication holds its delegate weakly
  guard let dir = options.watch else { exit(64) }
  holdDeskLock(in: dir)
  let delegate = Desk(dir: dir)
  app.delegate = delegate
  app.setActivationPolicy(.accessory)
  app.run()
  withExtendedLifetime(delegate) {}
}
