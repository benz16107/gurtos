// Where the apps look for the GurtOS relay and the hosted web app. A self-hoster sets GURTOS_RELAY and GURTOS_APP_HOST
// in native/apple/project.yml (the build writes them into each app's Info.plist and into the app's associated
// domain), and every address below follows. Without GURTOS_RELAY the apps use no relay: the hosted one is gone.
// docs/self-host.md has the rest.
import Foundation

public enum GurtConfig {
  /** The relay's address: a box's name lives under its host, and pushes and Quick Start go through it. nil when none is set. */
  public static let relay: URL? = value("GurtOSRelay").flatMap { URL(string: $0) }
  /** What a person sees when something needs a relay and none is set. Nothing calls the network first. */
  public static let noRelay = "To reach this computer from anywhere, run your own relay (gurtos.com/docs/guides/self-host/) and add its address in Settings, or use a private network such as Tailscale."
  public static let noRelayPush = "Phone notifications need a relay. Run your own relay (gurtos.com/docs/guides/self-host/) and add its address in Settings. A private network such as Tailscale does not send notifications."
  /** The hosted web app's host, whose links open the apps (pairing and Quick Start QR codes). */
  public static let appHost: String = value("GurtOSAppHost") ?? "app.gurtos.com"

  public static var relayHost: String? { relay?.host }
  /** A box's name on the relay: "rosa.relay.example.com". Never true with no relay. */
  public static func isRelayName(_ host: String, relayHost: String? = GurtConfig.relayHost) -> Bool { relayHost.map { host.hasSuffix(".\($0)") } ?? false }

  /** An Info.plist value, unless the build left its `$(...)` placeholder in. */
  static func value(_ key: String) -> String? {
    guard let v = Bundle.main.object(forInfoDictionaryKey: key) as? String, !v.isEmpty, !v.hasPrefix("$(") else { return nil }
    return v
  }
}
