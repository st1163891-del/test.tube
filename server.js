const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

    if (!url) {
        return res.status(400).json({ error: "Missing URL" });
    }

    if (
        !url.includes("youtube.com/") &&
        !url.includes("youtu.be/")
    ) {
        return res.status(400).json({ error: "Not a YouTube URL" });
    }

    const id = crypto.randomBytes(8).toString("hex");
    const dir = path.join("/tmp", id);
    const video = path.join(dir, "video.mp4");

    fs.mkdirSync(dir, { recursive: true });

    try {
        await download(url, video);

        const frames = await convert(video);

        fs.rmSync(dir, {
            recursive: true,
            force: true
        });

        res.json({
            width: WIDTH,
            height: HEIGHT,
            fps: FPS,
            frames
        });

    } catch (err) {
        try {
            fs.rmSync(dir, {
                recursive: true,
                force: true
            });
        } catch {}

        res.status(500).json({
            error: "Conversion failed"
        });
    }
});

function download(url, output) {
    return new Promise((resolve, reject) => {
        const p = spawn("yt-dlp", [
            "--no-playlist",
            "-f",
            "worst[ext=mp4]/worst",
            "-o",
            output,
            url
        ]);

        p.on("close", code => {
            if (code === 0 && fs.existsSync(output)) {
                resolve();
            } else {
                reject(new Error("download failed"));
            }
        });

        p.on("error", reject);
    });
}

function convert(input) {
    return new Promise((resolve, reject) => {
        const p = spawn("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input,
            "-t",
            String(MAX_SECONDS),
            "-vf",
            `fps=${FPS},scale=${WIDTH}:${HEIGHT}`,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1"
        ]);

        const chunks = [];

        p.stdout.on("data", chunk => {
            chunks.push(chunk);
        });

        p.on("close", code => {
            if (code !== 0) {
                reject(new Error("ffmpeg failed"));
                return;
            }

            const buffer = Buffer.concat(chunks);
            const frameSize = WIDTH * HEIGHT * 3;
            const frames = [];

            for (
                let offset = 0;
                offset + frameSize <= buffer.length;
                offset += frameSize
            ) {
                frames.push(
                    buffer
                        .subarray(offset, offset + frameSize)
                        .toString("base64")
                );
            }

            resolve(frames);
        });

        p.on("error", reject);
    });
}

app.listen(PORT, "0.0.0.0");
