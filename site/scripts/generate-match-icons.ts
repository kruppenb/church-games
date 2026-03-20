/**
 * Generate polished tile and powerup icons for Kingdom Match using Gemini AI
 *
 * Usage:
 *   Set GEMINI_API_KEY environment variable
 *   cd site && npx tsx scripts/generate-match-icons.ts
 */

import { GoogleGenAI } from "@google/genai";
import { writeFile, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

// Resolve paths relative to this script's location (site/scripts/)
const __dirname_script = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname_script, "..");
const OUTPUT_DIR = resolve(SITE_ROOT, "public/assets/match");

function saveBinaryFile(fileName: string, content: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(fileName), { recursive: true });

    writeFile(fileName, content, (err) => {
      if (err) {
        console.error(`Error writing file ${fileName}:`, err);
        reject(err);
        return;
      }
      console.log(`  Saved: ${fileName}`);
      resolve();
    });
  });
}

async function generateImage(
  ai: GoogleGenAI,
  prompt: string,
  outputPath: string,
): Promise<void> {
  console.log(`\nGenerating: ${outputPath}`);
  console.log(`Prompt: ${prompt.substring(0, 100)}...`);

  const config = {
    responseModalities: ["IMAGE", "TEXT"] as const,
    imageConfig: {
      imageSize: "1K" as const,
    },
  };

  const model = "gemini-3-pro-image-preview";
  const contents = [
    {
      role: "user" as const,
      parts: [{ text: prompt }],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });

  for await (const chunk of response) {
    if (!chunk.candidates?.[0]?.content?.parts) {
      continue;
    }

    const inlineData = chunk.candidates[0].content.parts[0]?.inlineData;
    if (inlineData) {
      const buffer = Buffer.from(inlineData.data || "", "base64");

      // Save original high-res version
      const hiresPath = outputPath.replace(".png", "_hires.png");
      await saveBinaryFile(hiresPath, buffer);

      // Resize to 128x128 for game use
      const resizedBuffer = await sharp(buffer)
        .resize(128, 128, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      await saveBinaryFile(outputPath, resizedBuffer);

      return;
    } else if (chunk.text) {
      console.log("AI response:", chunk.text);
    }
  }

  console.warn(`Warning: No image generated for ${outputPath}`);
}

// Base style description for consistency across all icons
const baseStyle =
  "Royal Match mobile game style, polished 3D-looking icon, glossy surface with bright highlights and reflections, vibrant saturated colors, cartoon style with clean smooth edges, centered composition on transparent background, single game asset icon, no text, no shadows outside icon, professional mobile game quality";

// Tile icons (Bible-themed)
const tileSprites = [
  {
    filename: "heart.png",
    prompt: `${baseStyle}, bright red heart gemstone, multifaceted crystalline heart shape, deep crimson red with glowing love warmth, bright white highlight reflections, symbol of love`,
  },
  {
    filename: "star.png",
    prompt: `${baseStyle}, golden star gemstone, multifaceted five-pointed star shape, rich golden yellow with brilliant sparkle reflections, radiant glowing faith symbol, warm shining appearance`,
  },
  {
    filename: "cross.png",
    prompt: `${baseStyle}, blue cross gemstone, multifaceted cross shape, deep royal blue sapphire cross with bright white highlight reflections, symbol of hope, serene and powerful`,
  },
  {
    filename: "dove.png",
    prompt: `${baseStyle}, white and silver dove gemstone, multifaceted dove bird shape, pearlescent white with silver iridescent reflections, peaceful and pure, symbol of peace, elegant small bird icon`,
  },
  {
    filename: "crown.png",
    prompt: `${baseStyle}, purple crown gemstone, multifaceted royal crown shape, deep violet purple amethyst with golden accents and bright reflections, symbol of victory, majestic regal appearance`,
  },
  {
    filename: "scroll.png",
    prompt: `${baseStyle}, brown and amber scroll gemstone, multifaceted scroll shape, warm amber and golden brown with parchment texture, bright highlight reflections, symbol of wisdom, ancient knowledge`,
  },
];

// Powerup icons
const powerupSprites = [
  {
    filename: "lineblast.png",
    prompt: `${baseStyle}, glowing horizontal and vertical arrow powerup icon, bright cyan and electric blue energy arrows pointing in four directions (up down left right), lightning energy trails, explosive power effect, game powerup item`,
  },
  {
    filename: "bomb.png",
    prompt: `${baseStyle}, radiant explosion orb powerup icon, orange and red glowing energy sphere, fiery explosive particles radiating outward, intense bright center, dynamic explosion effect, game powerup item`,
  },
  {
    filename: "rainbow.png",
    prompt: `${baseStyle}, prismatic rainbow star powerup icon, six-pointed star with swirling rainbow colors flowing through it, multicolor sparkles and light rays, magical cosmic energy, iridescent surface, game powerup item`,
  },
];

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable not set");
    console.log("\nTo set the key:");
    console.log('  PowerShell: $env:GEMINI_API_KEY = "your-api-key"');
    console.log('  Bash: export GEMINI_API_KEY="your-api-key"');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  const allSprites = [...tileSprites, ...powerupSprites].map((s) => ({
    ...s,
    path: resolve(OUTPUT_DIR, s.filename),
  }));

  console.log("Generating Kingdom Match Tile & Powerup Icons");
  console.log("==============================================\n");
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Total icons to generate: ${allSprites.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const sprite of allSprites) {
    try {
      await generateImage(ai, sprite.prompt, sprite.path);
      successCount++;
      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to generate ${sprite.filename}:`, error);
      failCount++;
    }
  }

  console.log("\n==============================================");
  console.log(`Generated: ${successCount}/${allSprites.length}`);
  if (failCount > 0) {
    console.log(`Failed: ${failCount}`);
  }
  console.log("\nGenerated files:");
  console.log(`- 128x128 tile icons in ${OUTPUT_DIR}`);
  console.log("- High-res originals saved as *_hires.png");
  console.log("\nNext steps:");
  console.log("1. Review generated images");
  console.log("2. Re-run if any need regeneration");
  console.log("3. Run npm run dev to test in game");
}

main().catch(console.error);
