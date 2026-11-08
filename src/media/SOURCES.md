# Bundled aerial clip

- File: `aerial-coast.mp4`
- Selected and uploaded by the owner as `215124_tiny.mp4`.
- Source: [Pixabay clip 215124](https://pixabay.com/vi/videos/%C4%91%E1%BA%A1i-d%C6%B0%C6%A1ng-b%E1%BB%9D-bi%E1%BB%83n-bi%E1%BB%83n-s%C3%B3ng-215124/).
- External media remains subject to the [Pixabay Content License](https://pixabay.com/service/license-summary/), not this repository's MIT code license.
- The source page could not be retrieved from this environment (HTTP 403); no author credit or additional source-page metadata is claimed here.
- Original: 1280×720, H.264 High Level 3.1, progressive 8-bit YUV420P,
  30000/1001 fps, 27.093733 seconds, 13,977,881 bytes, no audio track;
  contained a timecode data track.
- Packaged copy: 1920×1080 (upscaled from 720p; no additional source detail),
  H.264 Main Level 4.0, progressive 8-bit YUV420P, 30000/1001 fps,
  27.093733 seconds, 13,968,290 bytes, about 4.12 Mbps video.
  One video stream only; no audio, subtitle, chapter or data tracks.
- Fast-start verified: `moov` precedes `mdat`. The original upload is preserved
  separately; the packaged copy is a new file.

Transcoded locally using the existing ffmpeg installation:

```sh
ffmpeg -i 215124_tiny.mp4 -map 0:v:0 -an -sn -dn \
  -map_metadata -1 -map_chapters -1 \
  -vf scale=1920:1080:flags=lanczos,setsar=1 \
  -r 30000/1001 -fps_mode cfr -c:v libx264 -profile:v main -level:v 4.0 \
  -pix_fmt yuv420p -preset medium -b:v 4M -maxrate 6M -bufsize 8M \
  -g 60 -movflags +faststart -write_tmcd 0 aerial-coast.mp4
```

SHA-256:

- Original: `55acab4bcffeeeb87fdde8466782e79463dbdf038380c727d2db338d24084a4c`
- Packaged: `66a68c07468a0545be09845f71240d6b436406a6c8cdc54fcba53fd7149f8dfb`
