// The Tenara "Today" widget: the signed-in person's chores left today.
//
// The app writes a JSON snapshot to the shared App Group after each Today
// load (src/features/widgets/snapshot.ts, version 1) and asks WidgetKit to
// reload. The widget never calls the API and holds no tokens.

import SwiftUI
import WidgetKit

private let appGroup = "group.com.gettenara.family"

struct Snapshot: Codable {
  struct Row: Codable {
    let name: String
    let when: String
  }
  let v: Int
  let name: String
  let locked: Bool
  let done: Int
  let total: Int
  let left: Int
  let next: [Row]
  let waiting: Int?
}

struct TodayEntry: TimelineEntry {
  let date: Date
  let snapshot: Snapshot?
}

private func loadSnapshot() -> Snapshot? {
  guard
    let raw = UserDefaults(suiteName: appGroup)?.string(forKey: "today"),
    let data = raw.data(using: .utf8),
    let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
    snapshot.v == 1
  else { return nil }
  return snapshot
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry(
      date: Date(),
      snapshot: Snapshot(
        v: 1, name: "Sally", locked: false, done: 2, total: 5, left: 3,
        next: [.init(name: "Feed the dog", when: "Due 5:00 PM"),
               .init(name: "Tidy your room", when: "Due today")],
        waiting: nil))
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : TodayEntry(date: Date(), snapshot: loadSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    // The app reloads the widget whenever Today changes; refresh hourly regardless.
    let entry = TodayEntry(date: Date(), snapshot: loadSnapshot())
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(3600))))
  }
}

private let emerald = Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
private let slate = Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
private let muted = Color(red: 51 / 255, green: 65 / 255, blue: 85 / 255)

/// Same wording as widgetText() in snapshot.ts.
private func text(for s: Snapshot?) -> (title: String, subtitle: String) {
  guard let s else { return ("Tenara", "Open the app to see today's chores.") }
  if s.locked { return ("Tenara", "Widgets are part of Tenara Pro.") }
  let title = s.left == 0 ? "All done, \(s.name)!" : "\(s.name): \(s.left) left today"
  var parts = [s.total > 0 ? "\(s.done) of \(s.total) done" : "Nothing due today"]
  if let waiting = s.waiting, waiting > 0 { parts.append("\(waiting) to review") }
  return (title, parts.joined(separator: " · "))
}

struct TodayView: View {
  @Environment(\.widgetFamily) var family
  let entry: TodayEntry

  var body: some View {
    let words = text(for: entry.snapshot)
    let rows = (entry.snapshot?.locked ?? true) ? [] : (entry.snapshot?.next ?? [])
    VStack(alignment: .leading, spacing: 4) {
      Text(words.title).font(.headline).foregroundStyle(slate).lineLimit(2)
      Text(words.subtitle).font(.caption).foregroundStyle(muted)
      if let s = entry.snapshot, !s.locked, s.total > 0, family == .systemSmall {
        Spacer(minLength: 4)
        ProgressView(value: Double(s.done), total: Double(max(s.total, 1))).tint(emerald)
      }
      if family != .systemSmall {
        ForEach(Array(rows.prefix(3).enumerated()), id: \.offset) { _, row in
          HStack {
            Text("• \(row.name)").font(.footnote).foregroundStyle(slate).lineLimit(1)
            Spacer()
            Text(row.when).font(.caption2).foregroundStyle(muted)
          }
        }
      }
      Spacer(minLength: 0)
    }
    .containerBackground(.white, for: .widget)
    .widgetURL(URL(string: "tenarafamily://"))
  }
}

@main
struct TenaraWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "Today", provider: Provider()) { entry in
      TodayView(entry: entry)
    }
    .configurationDisplayName("Today's chores")
    .description("What's left today, at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
