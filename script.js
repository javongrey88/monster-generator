// script.js

// ───────────────────────────────────────────────────────
// ► DOM Elements
const form = document.getElementById("monster-form");
const imageEl = document.getElementById("monster-image");
const promptOutput = document.getElementById("prompt-output");
const historyContainer = document.getElementById("history-container");
const downloadBtn = document.getElementById("download-btn");

// ───────────────────────────────────────────────────────
// ► On Page Load: Render History
document.addEventListener("DOMContentLoaded", () => {
    loadHistory();
});

// ───────────────────────────────────────────────────────
// ► Form Submission Handler
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1) Gather inputs
    const baseType = document.getElementById("base-type").value;
    const features = Array.from(
        document.querySelectorAll("input[name='feature']:checked")
    ).map((checkbox) => checkbox.value);

    if (features.length === 0) {
        promptOutput.innerText = "⚠️ Please select at least one feature.";
        imageEl.style.display = "none";
        downloadBtn.style.display = "none";
        return;
    }

    const prompt = generatePrompt(baseType, features);
    console.log("Generated Prompt:", prompt);

    try {
        // 2) Ask Leonardo.ai for a URL
        const rawImageUrl = await generateImageFromLeonardo(prompt);

        // 3) Prepare the <img> element:
        //    - Remove any previous onload/onerror handlers, hide it, clear src
        imageEl.onload = null;
        imageEl.onerror = null;
        imageEl.style.display = "none";
        imageEl.src = "";

        // 4) Once the image actually loads, display it
        imageEl.onload = () => {
            console.log("✅ Direct IMG load succeeded.");
            imageEl.style.display = "block";
            promptOutput.innerText = `🧠 Prompt: ${prompt}`;
        };

        // 5) If direct load fails (CORS, etc.), fall back to Blob
        imageEl.onerror = async (err) => {
            console.warn("❌ Direct IMG load failed, doing Blob fallback…", err);
            try {
                const imgResp = await fetch(rawImageUrl);
                if (!imgResp.ok) throw new Error("Network response not OK");
                const imgBlob = await imgResp.blob();
                const objectURL = URL.createObjectURL(imgBlob);
                imageEl.src = objectURL;
                console.log("✅ Blob fallback load succeeded.");
                imageEl.style.display = "block";
                promptOutput.innerText = `🧠 Prompt: ${prompt}`;
                // Revoke object URL later to free memory
                setTimeout(() => URL.revokeObjectURL(objectURL), 60_000);
            } catch (blobErr) {
                console.error("Blob fallback also failed:", blobErr);
                promptOutput.innerText = "⚠️ Failed to load image preview.";
                imageEl.style.display = "none";
            }
        };

        // 6) Try direct assignment now (will trigger onload or onerror)
        imageEl.src = rawImageUrl;
        imageEl.alt = "Generated monster";

        // 7) Configure Download button
        downloadBtn.style.display = "inline-block";
        downloadBtn.textContent = "Download Monster";
        downloadBtn.onclick = async () => {
            try {
                const resp = await fetch(rawImageUrl);
                if (!resp.ok) throw new Error("Network response not OK");
                const blob = await resp.blob();
                const objectURL = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = objectURL;
                link.download = `monster-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(objectURL);
            } catch (err) {
                console.error("Download failed:", err);
                alert("⚠️ Failed to download image. See console.");
            }
        };

        // 8) Save to history & re-render
        saveToHistory(prompt, rawImageUrl);
        renderHistory();
    } catch (err) {
        console.error("Generation error:", err);
        promptOutput.innerText = "⚠️ Failed to generate image. Please try again.";
        imageEl.style.display = "none";
        downloadBtn.style.display = "none";
    }
});

// ───────────────────────────────────────────────────────
// ► Build the Text Prompt
function generatePrompt(baseType, features) {
    return `A terrifying ${baseType} with ${features.join(
        ", "
    )}, rendered in cinematic concept art style with dramatic lighting.`;
}

// ───────────────────────────────────────────────────────
// ► Leonardo.ai API Call with Correct Polling
async function generateImageFromLeonardo(prompt) {
    const apiKey = "be64d1d0-c440-4f8e-8c03-1db0108ebe71";
    const endpoint = "https://cloud.leonardo.ai/api/rest/v1/generations";

    // 1) POST to start generation
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            prompt: prompt,
            width: 512,
            height: 512,
            num_images: 1,
            modelId: "e316348f-7773-490e-adcd-46757c738eb7",
            scheduler: "LEONARDO",
            guidance_scale: 7,
        }),
    });

    console.log("Generation HTTP status:", response.status);
    const data = await response.json();
    console.log("POST API Response:", data);

    if (response.status !== 200 || !data.sdGenerationJob) {
        console.error("Leonardo POST error:", data);
        throw new Error("Generation request failed.");
    }

    const generationId = data.sdGenerationJob.generationId;

    // 2) Poll for completion
    for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000)); // wait 2s

        const statusResp = await fetch(
            `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
            {
                method: "GET",
                headers: {
                    authorization: `Bearer ${apiKey}`,
                },
            }
        );

        console.log("Polling status HTTP:", statusResp.status);
        const statusData = await statusResp.json();
        console.log("GET Poll Response:", statusData);

        // Look under generations_by_pk → generated_images
        const imageObj =
            statusData.generations_by_pk?.generated_images?.[0] || null;
        if (imageObj && imageObj.url) {
            console.log("Image ready:", imageObj.url);
            return imageObj.url;
        }
    }

    throw new Error("Image not ready after polling.");
}

// ───────────────────────────────────────────────────────
// ► History Management in localStorage

// Load and render history on page load
function loadHistory() {
    const json = localStorage.getItem("monsterHistory");
    if (!json) return;
    renderHistory();
}

// Save one monster entry to history
function saveToHistory(prompt, imageUrl) {
    const existing = JSON.parse(localStorage.getItem("monsterHistory")) || [];
    existing.unshift({ prompt, imageUrl, timestamp: Date.now() });
    if (existing.length > 50) existing.pop();
    localStorage.setItem("monsterHistory", JSON.stringify(existing));
}

// Render the history gallery
function renderHistory() {
    const existing = JSON.parse(localStorage.getItem("monsterHistory")) || [];
    historyContainer.innerHTML = ""; // clear previous content

    if (existing.length === 0) {
        historyContainer.innerHTML = `
      <p style="opacity: 0.7;">
        No history yet. Generate a monster to see it here.
      </p>`;
        return;
    }

    existing.forEach((entry) => {
        // Create the card container
        const card = document.createElement("div");
        card.style.display = "inline-block";
        card.style.margin = "0.5rem";
        card.style.padding = "0.5rem";
        card.style.background = "#1a1a1a";
        card.style.border = "1px solid #ff5500";
        card.style.borderRadius = "6px";
        card.style.textAlign = "center";
        card.style.width = "120px";

        // Thumbnail <img>
        const thumb = document.createElement("img");
        thumb.src = entry.imageUrl;
        thumb.alt = entry.prompt;
        thumb.style.width = "100%";
        thumb.style.borderRadius = "4px";
        thumb.style.display = "block";
        thumb.style.marginBottom = "0.4rem";
        thumb.style.cursor = "pointer";

        // When thumbnail is clicked, open lightbox
        thumb.addEventListener("click", () => {
            showModal(entry.imageUrl, entry.prompt);
        });

        // Prompt text (truncated)
        const text = document.createElement("p");
        text.innerText =
            entry.prompt.length > 30
                ? entry.prompt.substring(0, 30) + "..."
                : entry.prompt;
        text.style.fontSize = "0.75rem";
        text.style.color = "#ffcc99";
        text.style.margin = "0";

        // Append thumb + text to the card, then card into container
        card.appendChild(thumb);
        card.appendChild(text);
        historyContainer.appendChild(card);
    });
}

// ───────────────────────────────────────────────────────
// ► Lightbox / Modal Logic

function showModal(imgUrl, captionText) {
    const modal = document.getElementById("lightbox-modal");
    const lightboxImg = document.getElementById("lightbox-image");
    const lightboxCaption = document.getElementById("lightbox-caption");
    const closeBtn = document.getElementById("lightbox-close");
    const backdrop = document.getElementById("lightbox-backdrop");

    lightboxImg.src = imgUrl;
    lightboxCaption.innerText = captionText;
    modal.classList.add("visible");
    modal.classList.remove("hidden");

    // Close when "Close" button clicked
    closeBtn.onclick = () => {
        modal.classList.remove("visible");
        modal.classList.add("hidden");
        lightboxImg.src = "";
    };

    // Also close when clicking the backdrop
    backdrop.onclick = () => {
        modal.classList.remove("visible");
        modal.classList.add("hidden");
        lightboxImg.src = "";
    };
}











