const express = require("express");
const youtubedl = require("youtube-dl-exec");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 10000;

const WIDTH = 32;
const HEIGHT = 18;
const FPS = 10;
const MAX_SECONDS = 30;

app.get("/", (req, res) => {
    res.send("OK");
});

app.get("/video", async (req, res) => {
    const url = req.query.url;

    if (!url || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
        return res.status(400).json({
            error: "Invalid YouTube URL"
        });
    }

    const id = Date.now().toString();
    const dir = path.join(os.tmpdir(), "roblox_video_" + id);
    const input = path.join(dir, "video.mp4");

    try {
        fs.mkdirSync(dir, { recursive: true });

        await youtubedl(url, {
            output: input,
            format: "worst[ext=mp4]/worst",
            noPlaylist: true,
            maxFilesize: "100M"
        });

        const ffmpeg = spawn("ffmpeg", [
            "-i", input,
            "-t", String(MAX_SECONDS),
            "-vf", `fps=${FPS},scale=${WIDTH}:${HEIGHT}`,
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "pipe:1"
        ]);

        const chunks = [];

        ffmpeg.stdout.on("data", chunk => {
            chunks.push(chunk);
        });

        ffmpeg.stderr.on("data", () => {});

        ffmpeg.on("close", code => {
            try {
                fs.rmSync(dir, {
                    recursive: true,
                    force: true
                });
            } catch {}

            if (code !== 0) {
                return res.status(500).json({
                    error: "Video conversion failed"
                });
            }

            const data = Buffer.concat(chunks);

            const frameSize = WIDTH * HEIGHT * 3;
            const frameCount = Math.floor(data.length / frameSize);

            const frames = [];

            for (let f = 0; f < frameCount; f++) {
                const start = f * frameSize;
                frames.push(
                    data.subarray(start, start + frameSize).toString("base64")
                );
            }

            res.json({
                width: WIDTH,
                height: HEIGHT,
                fps: FPS,
                frames
            });
        });

    } catch {
        try {
            fs.rmSync(dir, {
                recursive: true,
                force: true
            });
        } catch {}

        res.status(500).json({
            error: "Download failed"
        });
    }
});

app.listen(PORT, "0.0.0.0");
