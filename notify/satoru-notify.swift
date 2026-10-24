// Satoru's notification: a borderless panel floating over every app and space, top right of the screen under the
// pointer. Clicked, it opens the conversation that finished; hovered, it stays. The mod builds it on first use:
//   swiftc -O -o bin/satoru-notify notify/satoru-notify.swift
//   satoru-notify -title "∞ Satoru terminó" -message "Pan comido." [-open claude://…] [-seconds 6] [-sprite w:h:x,y,rrggbb;…]
// With -watch it is Satoru on the desktop instead, for as long as a conversation is open (see Desk below):
//   satoru-notify -watch <sessions folder>
import AppKit
import WebKit

let PURPLE = NSColor(srgbRed: 0.56, green: 0.33, blue: 0.96, alpha: 1)
let TEXT_WIDTH: CGFloat = 260
let MARGIN: CGFloat = 16
// It slides in from the right this far
let SLIDE: CGFloat = 24
// Once the pointer leaves it, it lingers this long
let LINGER_SECONDS = 2.0

// Each sprite pixel is this many points: Gojo's 30 rows stand 60 tall
let SPRITE_UNIT: CGFloat = 2

struct Pixel {
  let x: Int
  let y: Int
  let color: NSColor
}

/** The mod's Gojo, `w:h:` then `x,y,rrggbb` pixels split by `;`. */
struct Sprite {
  let width: Int
  let height: Int
  let pixels: [Pixel]

  init?(_ text: String) {
    let parts = text.split(separator: ":", maxSplits: 2)
    guard parts.count == 3, let width = Int(parts[0]), let height = Int(parts[1]) else { return nil }
    self.width = width
    self.height = height
    pixels = parts[2].split(separator: ";").compactMap { pixel in
      let fields = pixel.split(separator: ",")
      guard fields.count == 3, let x = Int(fields[0]), let y = Int(fields[1]), let rgb = Int(fields[2], radix: 16) else { return nil }
      let channel = { (shift: Int) in CGFloat((rgb >> shift) & 0xff) / 255 }

      return Pixel(x: x, y: y, color: NSColor(srgbRed: channel(16), green: channel(8), blue: channel(0), alpha: 1))
    }
  }
}

/** Draws the sprite square by square, top down. */
final class SpriteView: NSView {
  var sprite: Sprite {
    didSet {
      invalidateIntrinsicContentSize()
      needsDisplay = true
    }
  }
  let unit: CGFloat

  init(_ sprite: Sprite, unit: CGFloat = SPRITE_UNIT) {
    self.sprite = sprite
    self.unit = unit
    super.init(frame: .zero)
  }

  required init?(coder: NSCoder) { nil }

  override var isFlipped: Bool { true }
  override var intrinsicContentSize: NSSize {
    NSSize(width: CGFloat(sprite.width) * unit, height: CGFloat(sprite.height) * unit)
  }

  override func draw(_ dirtyRect: NSRect) {
    for pixel in sprite.pixels {
      pixel.color.setFill()
      NSRect(x: CGFloat(pixel.x) * unit, y: CGFloat(pixel.y) * unit, width: unit, height: unit).fill()
    }
  }
}

struct Options {
  var title = "∞ Satoru"
  var message = ""
  var open: URL?
  var seconds = 6.0
  var sprite: Sprite?
  var watch: URL?
}

func parse() -> Options {
  var options = Options()
  var args = CommandLine.arguments.dropFirst().makeIterator()
  while let flag = args.next(), let value = args.next() {
    switch flag {
    case "-title": options.title = value
    case "-message": options.message = value
    case "-open": options.open = URL(string: value)
    case "-seconds": options.seconds = Double(value) ?? options.seconds
    case "-sprite": options.sprite = Sprite(value)
    case "-watch": options.watch = URL(fileURLWithPath: value).standardizedFileURL
    default: break
    }
  }
  return options
}

/** The card itself: takes the first click without activating anything, and says when the pointer is over it. */
final class Card: NSVisualEffectView {
  var onClick: () -> Void = {}
  var onHover: (Bool) -> Void = { _ in }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // The labels inside would take the click, and refuse the first one while this app is in the background
  override func hitTest(_ point: NSPoint) -> NSView? { frame.contains(point) ? self : nil }
  override func mouseDown(with event: NSEvent) {}
  override func mouseUp(with event: NSEvent) { onClick() }
  override func mouseEntered(with event: NSEvent) { onHover(true) }
  override func mouseExited(with event: NSEvent) { onHover(false) }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    trackingAreas.forEach(removeTrackingArea)
    addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways], owner: self))
  }
}

@MainActor
final class Notice: NSObject, NSApplicationDelegate {
  let options: Options
  var panel: NSPanel!
  var dismissal: Task<Void, Never>?

  init(_ options: Options) { self.options = options }

  func applicationDidFinishLaunching(_ notification: Notification) {
    let card = makeCard()
    let size = card.fittingSize
    let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main!
    let area = screen.visibleFrame
    let frame = NSRect(x: area.maxX - size.width - MARGIN, y: area.maxY - size.height - MARGIN, width: size.width, height: size.height)

    panel = NSPanel(contentRect: frame.offsetBy(dx: SLIDE, dy: 0), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.level = .statusBar
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.isFloatingPanel = true
    panel.hidesOnDeactivate = false
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.contentView = card
    panel.alphaValue = 0
    panel.orderFrontRegardless()

    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.25
      context.timingFunction = CAMediaTimingFunction(name: .easeOut)
      panel.animator().setFrame(frame, display: true)
      panel.animator().alphaValue = 1
    }
    schedule(after: options.seconds)
  }

  func makeCard() -> Card {
    let card = Card()
    card.material = .hudWindow
    card.blendingMode = .behindWindow
    card.state = .active
    card.appearance = NSAppearance(named: .vibrantDark)
    card.wantsLayer = true
    card.layer?.cornerRadius = 14
    card.layer?.masksToBounds = true
    card.layer?.borderWidth = 1
    card.layer?.borderColor = PURPLE.withAlphaComponent(0.6).cgColor
    card.onClick = { [weak self] in self?.open() }
    card.onHover = { [weak self] isOver in
      guard let self else { return }
      if isOver { dismissal?.cancel() } else { schedule(after: LINGER_SECONDS) }
    }

    let face = options.sprite.map { SpriteView($0) } ?? makeSeal()

    let title = NSTextField(labelWithString: options.title)
    title.font = .systemFont(ofSize: 13, weight: .semibold)
    title.textColor = .white
    title.lineBreakMode = .byTruncatingTail
    let message = NSTextField(wrappingLabelWithString: options.message)
    message.font = .systemFont(ofSize: 12)
    message.textColor = .secondaryLabelColor
    message.maximumNumberOfLines = 3
    message.preferredMaxLayoutWidth = TEXT_WIDTH

    let text = NSStackView(views: [title, message])
    text.orientation = .vertical
    text.alignment = .leading
    text.spacing = 2
    let row = NSStackView(views: [face, text])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 12
    row.edgeInsets = NSEdgeInsets(top: 14, left: 14, bottom: 14, right: 16)
    card.addSubview(row)
    row.translatesAutoresizingMaskIntoConstraints = false

    NSLayoutConstraint.activate([
      text.widthAnchor.constraint(equalToConstant: TEXT_WIDTH),
      row.leadingAnchor.constraint(equalTo: card.leadingAnchor),
      row.trailingAnchor.constraint(equalTo: card.trailingAnchor),
      row.topAnchor.constraint(equalTo: card.topAnchor),
      row.bottomAnchor.constraint(equalTo: card.bottomAnchor),
    ])

    return card
  }

  /** Without a sprite, the ∞ seal on a purple disc. */
  func makeSeal() -> NSView {
    let seal = NSTextField(labelWithString: "∞")
    seal.font = .systemFont(ofSize: 22, weight: .bold)
    seal.textColor = .white
    seal.alignment = .center
    let ring = NSView()
    ring.wantsLayer = true
    ring.layer?.backgroundColor = PURPLE.cgColor
    ring.layer?.cornerRadius = 20
    ring.addSubview(seal)
    seal.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      ring.widthAnchor.constraint(equalToConstant: 40),
      ring.heightAnchor.constraint(equalToConstant: 40),
      seal.centerXAnchor.constraint(equalTo: ring.centerXAnchor),
      seal.centerYAnchor.constraint(equalTo: ring.centerYAnchor),
    ])

    return ring
  }

  func schedule(after seconds: Double) {
    dismissal?.cancel()
    dismissal = Task { [weak self] in
      try? await Task.sleep(for: .seconds(seconds))
      if !Task.isCancelled { self?.dismiss() }
    }
  }

  func open() {
    if let url = options.open { NSWorkspace.shared.open(url) }
    dismiss()
  }

  func dismiss() {
    dismissal?.cancel()
    NSAnimationContext.runAnimationGroup({ context in
      context.duration = 0.2
      panel.animator().alphaValue = 0
    }, completionHandler: { exit(0) })
  }
}

// Each conversation writes its state there every few seconds; a file older than this is a conversation gone
let STALE_SECONDS = 12.0
// With no conversation left this long it quits; at launch it waits as long for the first one
let ALONE_SECONDS = 20.0
// The band the mod writes is 66 × 30 band pixels of 4 px, and a 24 px line for the word; shown at three quarters
let DESK_ZOOM: CGFloat = 0.75
let DESK_SIZE = NSSize(width: 66 * 4 * DESK_ZOOM, height: (30 * 4 + 24) * DESK_ZOOM)
// Where his head is in the window, from its top left: the bubble's tail points there
let HEAD_X: CGFloat = 16 * 4 * DESK_ZOOM
let BUBBLE_TAIL: CGFloat = 10
let BUBBLE_TAIL_X: CGFloat = 18
let DESK_ORIGIN_KEY = "deskOrigin"
// Hidden from the right-click menu he waits as ∞ in the menu bar, and stays hidden across launches until clicked
let DESK_HIDDEN_KEY = "deskHidden"
let CLAUDE_APP = "com.anthropic.claudefordesktop"
// The balloon is never wider than his space, and wide enough for its tail to sit under his head
let BUBBLE_WIDTH = DESK_SIZE.width
let BUBBLE_MIN_WIDTH: CGFloat = 80
// The tail keeps this far from the balloon's ends, past its rounded corners
let BUBBLE_TAIL_MARGIN: CGFloat = 16
let STATES = ["working", "done", "idle"]

struct Session {
  let id: String
  let state: String
  let host: String?
  let label: String
  let line: String?
  // Its band, as the mod last wrote it
  let band: URL
  let bandModified: Date
}

/** The desktop Satoru's window: dragged anywhere, clicked to go back to Claude; right-click hides him. */
final class DeskView: NSView {
  var onClick: () -> Void = {}
  var onMoved: () -> Void = {}
  // The whole of his space, shown while he is held down or dragged: the transparent part reads as his too
  let outline = Outline()
  private var start = NSPoint.zero
  private var origin = NSPoint.zero
  private var isDragging = false

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // The band's web view covers it whole; it would take the click and the drag, and refuse the first in the background
  override func hitTest(_ point: NSPoint) -> NSView? { frame.contains(point) ? self : nil }

  override func mouseDown(with event: NSEvent) {
    start = NSEvent.mouseLocation
    origin = window?.frame.origin ?? .zero
    isDragging = false
    outline.isHidden = false
  }

  override func mouseDragged(with event: NSEvent) {
    let now = NSEvent.mouseLocation
    // A twitch of the hand is still a click
    if !isDragging && hypot(now.x - start.x, now.y - start.y) < 3 { return }
    isDragging = true
    window?.setFrameOrigin(NSPoint(x: origin.x + now.x - start.x, y: origin.y + now.y - start.y))
  }

  override func mouseUp(with event: NSEvent) {
    outline.isHidden = true
    if isDragging { onMoved() } else { onClick() }
  }
}

/** A dashed purple edge round the desktop Satoru's space. */
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

/** A comic balloon: white, outlined like his sprite, its tail down at the left toward his head. */
final class Balloon: NSView {
  var onClick: () -> Void = {}
  // Where the tail's tip is, from the balloon's left edge: under his head, wherever the balloon had to move
  var tailX = BUBBLE_TAIL_X { didSet { needsDisplay = true } }
  private let label: NSTextField

  init(text: String) {
    label = NSTextField(wrappingLabelWithString: text)
    label.font = .systemFont(ofSize: 12, weight: .medium)
    label.textColor = NSColor(srgbRed: 0.04, green: 0.04, blue: 0.06, alpha: 1)
    label.maximumNumberOfLines = 4
    // No wider than his own space: a long line wraps instead
    label.preferredMaxLayoutWidth = BUBBLE_WIDTH - 24
    let text = label.fittingSize
    super.init(frame: NSRect(x: 0, y: 0, width: max(text.width + 24, BUBBLE_MIN_WIDTH), height: text.height + 16 + BUBBLE_TAIL))
    label.frame = NSRect(x: 12, y: BUBBLE_TAIL + 8, width: text.width, height: text.height)
    addSubview(label)
  }

  required init?(coder: NSCoder) { nil }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // The label would take the click, and refuse the first one in the background
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
    // The seam where the tail meets the body, painted over so the two read as one outline
    NSColor.white.setFill()
    NSRect(x: tailX - 5, y: BUBBLE_TAIL - 1, width: 12, height: 3).fill()
  }
}

/**
 * Satoru on the desktop, one for every open conversation: the band of the one that matters most, live as the mod
 * writes it (the one that finished and you haven't seen, else one at work, else the last one to move), with every
 * pose, sphere and word the band has. A finish stays said above him until you go back to Claude; clicked, he opens
 * that conversation, or the one he shows. Hidden while Claude is in front, where the band already is.
 */
@MainActor
final class Desk: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  let dir: URL
  var panel: NSPanel!
  var web: WKWebView!
  // Until its empty page has loaded, a band handed to the web view is lost: it is drawn once the page is there
  var isWebReady = false
  var bubble: NSPanel?
  var bubbleFor: String?
  var shown: Session?
  var lastSeen = Date()
  var latestDone: Session?
  // A conversation stays done until its next prompt; once Claude has been in front since, you saw it finish
  var doneNow = Set<String>()
  var doneSeen = Set<String>()
  // When each one finished, so a click goes to the newest
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

    // Nothing behind him: he stands on the desktop itself, and the empty part of the window lets clicks through
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

  /** ∞ in the menu bar while he is hidden, ∞✓ once a conversation finishes; clicked, he comes back. */
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

  /** Reads every conversation's state, and shows the band of the one that matters most. */
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
        id: url.lastPathComponent, state: state, host: json["host"] as? String, label: json["label"] as? String ?? "",
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
    // One that left done and finishes again is news again; one finishing before your eyes never is
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
      if bubbleFor != done.id { say(done.label.isEmpty ? line : "\(done.label) · \(line)", for: done.id) }
    } else {
      hideBubble()
    }
  }

  /** The conversation's band in place of the last one, its animation starting over as the band's does. */
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

  /** The finish line in a comic balloon over his head, until you have seen it; clicked, it opens that conversation as he does. */
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

  /**
   * The balloon over his head, its left edge on his space's, its tail ending just inside his hair; kept whole on his
   * screen, it moves in from the edge and the tail follows so it still points at him.
   */
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

  /** The conversation that finished last, else the one he shows, else Claude itself, its minimized window brought back. */
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

  /** Where you left him, while that spot is still on a screen; the bottom right corner otherwise. */
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

/** One desktop Satoru however many conversations start him: the first holds this lock for its life, the rest leave. */
func holdDeskLock(in dir: URL) {
  try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  let fd = open(dir.appendingPathComponent(".desk.lock").path, O_CREAT | O_RDWR, 0o644)
  if fd < 0 || flock(fd, LOCK_EX | LOCK_NB) != 0 { exit(0) }
}

// Top-level code runs on the main thread, but Swift 5 mode doesn't count it as the main actor
MainActor.assumeIsolated {
  let options = parse()
  let app = NSApplication.shared
  // The delegate is held weakly; this keeps it alive for the app's life
  let delegate: NSApplicationDelegate
  if let dir = options.watch {
    holdDeskLock(in: dir)
    delegate = Desk(dir: dir)
  } else {
    delegate = Notice(options)
  }
  app.delegate = delegate
  app.setActivationPolicy(.accessory)
  app.run()
  withExtendedLifetime(delegate) {}
}
