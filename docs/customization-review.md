# Local customization review

Target: Samsung Q80T QA65Q80TAKXXV (2020), Tizen 5.5, firmware 2743.0.
Baseline: upstream commit `45b05b0e4b43288843e2eccc649a01cf0b1d2fbc`.

This fork contains the reviewed customization. No TV connection, signing,
packaging, installation, deployment, firmware change, system service or global
key mapping has been performed by this cloud session. The original install
script has not been executed here.

## Implemented navigation

- Settings returns to the grid; About returns to Settings; Library returns to
  the grid; Back in edit mode completes editing.
- Back from either screensaver returns to the app grid, even if idle activation
  occurred over Settings or Library. Other application navigation keys dismiss
  the saver to its previous screen.
- Back anywhere on the main grid opens an HTML confirmation dialog with
  **Stay in Lumen** selected by default. Back cancels it; Left/Right selects a
  button; OK activates that button. Only explicit **Exit Lumen** calls
  `tizen.application.getCurrentApplication().exit()`.
- A Back gesture is consumed through its matching keyup, including repeated
  keydowns. A saver-dismissal gesture also consumes its keyup. Neither can launch
  an underlying app, open a second screen or cascade through several views.
- The handlers run in the capture phase and cancel application Back events.
  Exit (10182), Home and Power are not registered or cancelled. Unknown keys,
  including volume keys, retain platform handling. No `tizenhwkey` handler is
  added: Samsung TV Web applications do not support that mobile event.
- Native long-press Return/Exit remains the platform's forced exit. There is no
  custom Return hold timer and no registered Exit key. A short Back event can
  show the dialog before a subsequent native long-press exit, if the TV emits
  both; the application does not cancel the native Exit event.

### What the original source establishes

Upstream `app.js` already calls `preventDefault()` for Back keydown. Its `back()`
closes Library, Settings or About, leaves editing, or moves grid focus to the
first tile. It never calls `exit()` or `hide()` for Back on the grid.
`platform.js` hides only as a fallback after HDMI handoff. Therefore the reported
short-Return exit cannot be conclusively attributed to the inspected source.
Possible differences in the installed build, event delivery, or a Return hold
remain unverified. The new capture handler and confirmation are tested locally,
but fixing that exact symptom must be confirmed on the physical TV later.

## Implemented aerial lifecycle

The existing `glass.prefs.v1` namespace now includes `saverStyle`, defaulting to
`images`. Invalid values also fall back to Images. Existing preferences and app
identity are preserved. Settings offers Images / Aerial video in all nine
existing UI languages. The original idle delay, image rotation speed and clock
opacity remain available; image speed does not change video playback speed.

`aerial.js` owns at most one video element. It creates it only on saver entry,
sets `preload="none"`, disables native controls and keyboard focus, and sets both
`muted` and `defaultMuted`. It assigns one packaged MP4 path or direct HTTPS MP4 URL at a time and
starts playback without waiting for `canplaythrough`. The next clip is loaded
only after the current one ends; there are no parallel players or video
crossfades. The existing image backdrop remains until playback starts.

On dismissal, failure, hidden state, pagehide or app/HDMI launch handoff, cleanup
invalidates callbacks, clears the watchdog, detaches listeners, pauses playback,
removes the source, calls `load()`, removes the video element and restores native
screensaver protection. It does not wait for a visual fade. Hidden-state cleanup
restores the previous Lumen view; resume refreshes app discovery and resets the
idle clock, without resuming video.

Network/decode errors, rejected `play()`, startup timeout (8 seconds) and lack of
playback progress (5 seconds) release the player and switch to the original image
saver for that session. Missing URLs do the same without a network request.
The saved style is not silently changed. Native protection is disabled only
during actual aerial playback, and restored during waiting/pause/exit/failure.
A late native OFF acknowledgement reasserts a newer ON request. Native API
absence or failure is caught and does not stop launcher navigation.

Image callbacks also have a session token, and the delayed description timer is
cancelled on exit. Image layers are cleared on close; background caches remain
available to the launcher.

### Media configuration status

The owner supplied `215124_tiny.mp4`, a 27.093733-second Pixabay coastline
clip. The original upload is 1280×720 H.264 High Level 3.1 at 29.97 fps, about
4.1 Mbps, without audio. It also contained a timecode data track.

The new packaged file `src/media/aerial-coast.mp4` is 1920×1080 H.264 Main
Level 4.0, 8-bit YUV420P SDR, 29.97 fps, 13,968,290 bytes (about 13.3 MiB),
with one video stream and no audio, subtitle or data tracks. It has fast-start
metadata, verified before the video payload, a 4 Mbps target/6 Mbps maximum
encoding rate and a 60-frame keyframe interval. This is an upscale of the 720p
source, not native 1080p detail. The original upload was not modified.

`GLASS_CONFIG.aerial.urls` now contains `media/aerial-coast.mp4`. The player
accepts constrained relative MP4 paths under `media/` as well as HTTPS URLs.
No video requests occur before Aerial entry. The clip plays from the application
package offline, and loops by reloading the same player; a brief restart gap is
possible. This adds about 13.3 MiB to package storage, not a permanent video
allocation while browsing the grid. No external media host or new origin is
needed. `config.xml` and its privileges remain unchanged.

See `src/media/SOURCES.md` for the original source link, media license reference,
checksums and reproducible conversion command. The Pixabay page returned HTTP
403 here; the owner-supplied file was inspected directly, without claiming source
page metadata or author attribution that could not be verified. The clip is not
covered by the repository's MIT code license.

For hosted playback, supply direct HTTPS MP4 URLs in `src/js/config.js` and add
the exact media origin and any redirect/CDN origins to `src/config.xml`.
Use 1920×1080 H.264 Main Profile Level 4.0, 24–30 fps constant frame rate,
8-bit YUV 4:2:0 SDR, no audio track, fast-start MP4, approximately 4–6 Mbps with
controlled peaks and regular keyframes. Muting is defensive; it does not remove
an audio track from a supplied file. The actual clip must be inspected before
calling it compliant with this encoding requirement.

The host should support TLS compatible with Tizen 5.5, a valid certificate
chain, `Content-Type: video/mp4`, byte ranges and correct 206 responses.
No CORS mode is requested and video is not copied to a canvas. Existing Internet
permission is sufficient for HTML5 media; no new native media, storage, download
or background privilege is needed. The manifest is unchanged for the bundled clip.

HTML5 does not expose a hard buffer-size limit or a synchronous decoder-release
guarantee. The implementation avoids eager loads and whole-file JavaScript
downloads; actual memory, buffering and decoder handoff need TV testing.
At 4–6 Mbps, optional hosted playback transfers about 1.8–2.7 GB/hour. The bundled clip has no external media traffic.

## Samsung capability boundaries

| Request | Established capability / limitation |
| --- | --- |
| Back within Lumen | Standard keydown handling can implement local navigation and an HTML exit confirmation. This is the ordinary application scope. |
| Long Return/Exit | Samsung documents forced termination and says not to register the long press. Exit must retain platform handling. |
| Launching YouTube, Apple TV, etc. | Existing `tizen.application.launch()` requests launch by ID. Its success callback acknowledges launch, not the other app's later exit. |
| Returning from other apps | No guaranteed caller/return stack is provided by the existing launch API. The other app and system decide what happens on exit. Lumen can restore itself when the OS actually makes it visible. |
| `launchAppControl()` replies | Replies require explicit cooperation by the target app through `replyResult()`/`replyFailure()`. They are not a generic third-party-app exit notification. No cooperation from YouTube or Apple TV has been established. |
| Background monitoring | Samsung documents that hidden apps are paused and cannot retrieve foreground-app information. Polling/relaunching Lumen would be unreliable and could interrupt legitimate viewing. None was implemented. |
| Home redirection / default launcher | Standard consumer Tizen Web APIs provide no supported way for Lumen to replace Smart Hub, claim systemwide Home, or become the system launcher. Home remains Samsung-controlled. |
| TV startup settings | Options such as resuming the last app may exist on some models/settings. Availability and behavior on this Q80T/firmware are untested; they do not establish Home redirection or reliable return from other apps. |

There are no experiments with service menus, firmware, privileged services,
systemwide remotes, background relaunch loops or third-party application changes.
The published APIs describe capabilities; they do not prove behavior on firmware
2743.0. Pinning Lumen in Smart Hub is a manual convenience, not a default-launcher
API or a tested automatic-return solution.

### References

- [Samsung: Terminating Applications and Return Key Policy](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html)
- [Samsung: Remote Control](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html)
- [Samsung: User Interaction Q&A](https://developer.samsung.com/smarttv/develop/faq/user-interaction.html)
- [Samsung: User Interaction; no TV tizenhwkey support](https://developer.samsung.com/smarttv/develop/guides/user-interaction/user-interaction.html)
- [Samsung: Application API and application-control replies](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html)
- [Samsung: Multitasking](https://developer.samsung.com/smarttv/develop/guides/fundamentals/multitasking.html)
- [Samsung: Device Information and Firmware Q&A](https://developer.samsung.com/smarttv/develop/faq/device-information-and-firmware.html)
- [Samsung: HTML5 Video Playback and resource reset](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-video-elements.html)
- [Samsung: Native Screensaver](https://developer.samsung.com/smarttv/develop/guides/fundamentals/setting-screensaver.html)
- [Samsung: AppCommon API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/appcommon-api.html)
- [Samsung: 2020 video specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2020-tv-video-specifications.html)
- [Samsung: Web engine specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)

The general termination guide explicitly documents confirmation dialogs. Some
Samsung Smart Hub Preview integration guidance has different Return requirements;
this app has no Smart Hub Preview integration. This local change is not a claim
of Samsung Store certification.

## Files changed

| File | Change |
| --- | --- |
| `src/js/app.js` | Saver style preference and setting; local Back dialog/navigation; complete dismissal gesture consumption; image-session guards; hidden/pagehide/launch cleanup. |
| `src/js/aerial.js` (new) | Lazy single-player lifecycle, failure watchdog, playlist, muted playback and teardown. |
| `src/js/platform.js` | Guarded app-local exit and native saver wrapper; existing launch/HDMI methods unchanged. |
| `src/js/config.js` | Bundled clip path and timeout defaults. |
| `src/index.html` | Video host, exit dialog and helper script. |
| `src/css/app.css` | Video placement, immediate saver exit and confirmation styling. |
| `src/js/i18n.js` | New labels and updated help in all nine languages. |
| `src/media/aerial-coast.mp4`, `src/media/SOURCES.md` (new) | Optimized owner-supplied clip, source and conversion record. |
| `scripts/serve.mjs` | MP4 MIME type, streamed reads, HEAD and byte-range support for local preview. |
| `tests/local.mjs` (new) | Browser regressions against the actual UI and media lifecycle, with mocked TV APIs. |
| `README.md`, this document | Configuration, limitations, test and review instructions. |

No production dependencies or build step were added. Application identity,
signing configuration, install script, firmware and system key registration are
unchanged. The customization is published to the owner’s fork, `nguyendnh29-stack/lumen`.
The upstream `jacksonjao/lumen` repository is unchanged.

## Local validation

Tests run against `node scripts/serve.mjs` in headless Chromium using the existing
Playwright installation. No dependencies were installed. TV APIs are mocked, not
emulated. A locally generated three-second fast-start MP4 is 1920×1080 H.264 Main
Level 4.0, YUV420P, 24 fps, with no audio (verified with ffprobe).

Result: all **61 local browser checks passed**, including 100 rapid saver cycles.
The exit dialog and bundled aerial were also visually inspected at 1920×1080. ES2016 parsing,
all new labels in nine languages, XML/app-identity validation and
`git diff --check` passed.

The browser suite covers local Back hierarchy, confirmation/cancel/explicit exit,
held-key suppression, native Exit passthrough, video opt-in and idle activation,
silent player properties, teardown/late events, hidden/pagehide/resume, mocked
YouTube and HDMI handoff, malformed/missing media, rejected playback, startup and
progress timeouts, preference persistence, native callback races, and old image
callbacks. It also performs 100 rapid saver open/close cycles. These checks do
not establish long-duration memory stability or physical TV behavior.

All browser JavaScript is checked with an ES2016 parser. `git diff --check` is
also run. Neither check installs tooling.

To reproduce with existing ffmpeg, Node, Chromium and Playwright:

```sh
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=24 -t 3 -an \
  -c:v libx264 -profile:v main -level:v 4.0 -pix_fmt yuv420p \
  -preset fast -b:v 4M -maxrate 6M -bufsize 8M -g 48 \
  -movflags +faststart /tmp/lumen-test.mp4
node scripts/serve.mjs
# In another terminal, from the same checkout:
LUMEN_TEST_VIDEO=/tmp/lumen-test.mp4 node tests/local.mjs
```

The synthetic fixture is served by Playwright routing at a synthetic HTTPS origin and does
not require changing the production allowlist. The configured bundled clip is also played through the real preview server, including a near-end loop, Back cleanup, and HTTP range/HEAD checks. ffprobe verifies its one video stream and no audio; ffmpeg decodes the complete packaged file without errors. No physical TV address is used.

## Physical TV acceptance plan (not performed)

After source review and separate authorization to test on the TV:

1. Archive the current signed WGT, source, signing identity and settings first.
   The existing installer overwrites `dist/Lumen.wgt`; do not use it during review.
2. Confirm short Return opens the dialog on every grid row. Cancel must preserve
   focus. Test About → Settings → grid, Library → grid, and editing → grid.
3. Test native long Return/Exit on every view, during buffering and playback.
   It must still force exit; Home and Power must retain Samsung behavior.
4. Test Back/OK/arrows held during saver dismissal. One gesture must only dismiss;
   the next deliberate press must work. Back from an idle saver over Settings
   must return to the app grid.
5. Inspect the supplied clip and host, then test actual playback, looping and
   native protection. Verify 1080p output/clock composition with the TV picture;
   a debugger screenshot can omit a hardware video plane.
6. Immediately launch YouTube, Apple TV and other installed apps after dismissal;
   test all connected HDMI shortcuts. Switch Home/source/power while loading and
   playing. On return to Lumen, no video should restart until the next idle entry.
7. Test connection loss, slow delivery, HTTP errors, corrupt clips, and expired
   URLs. Image fallback must remain dismissible and must not retry indefinitely.
8. Compare grid responsiveness and launch timings with baseline. Repeat at least
   100 full playback/exit cycles and a two-hour session; check TV memory and
   network/decoder activity, not only JavaScript heap or DOM element counts.

Samsung documents M69 for Tizen 5.5, but production changes retain the project's
older ES2016/M56 syntax baseline. Desktop Chromium results do not substitute for
the Q80T decoder, remote, OS lifecycle or firmware testing.

## Rollback

Select Images to bypass video without losing app order or HDMI names. Delay
Never disables automatic saver activation while retaining the manual tile.
If Back behavior is unsuitable, restore the baseline source/WGT using the same
`GlassLnch1.Glass` ID and original signing identity. Prefer an update to an
uninstall; uninstalling can erase stored preferences. Upstream merges preference
keys and ignores the added `saverStyle` key, so no destructive storage migration
is required. A previously installed signed baseline package is still needed for
an actual TV rollback; none has been retrieved or created here.
