const RECEIPT_INDEX_KEY = "receipts/index.json";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = makeCorsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (request.method === "POST" && url.pathname === "/upload") {
        return await handleUpload(request, env, corsHeaders);
      }

      if (request.method === "GET" && url.pathname === "/gallery") {
        return await handleGallery(env, corsHeaders);
      }

      if (request.method === "GET" && url.pathname === "/session") {
        return await handleSession(url, env, corsHeaders);
      }

      if (request.method === "GET" && url.pathname.startsWith("/receipt/")) {
        return await handlePublicReceiptAsset(url, env, corsHeaders);
      }

      return json({ error: "Not found" }, 404, corsHeaders);
    } catch (error) {
      return json({ error: error.message || "Server error" }, 500, corsHeaders);
    }
  }
};

function makeCorsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "https://luna.wedding",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

async function handleUpload(request, env, corsHeaders) {
  const form = await request.formData();

  const receipt = form.get("receipt");
  const galleryUrlFromClient = form.get("galleryUrl");
  const galleryPageUrl = String(galleryUrlFromClient || env.GALLERY_PAGE_URL || "https://luna.wedding/receipts/");

  if (!receipt || typeof receipt === "string") {
    return json({ error: "Missing receipt file" }, 400, corsHeaders);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const photoKeys = [];
  for (let i = 1; i <= 3; i++) {
    const photo = form.get(`photo${i}`);
    if (!photo || typeof photo === "string") continue;

    const key = `receipts/private/sessions/${id}/photo-${i}.jpg`;
    await env.LUNA_RECEIPTS.put(key, await photo.arrayBuffer(), {
      httpMetadata: {
        contentType: photo.type || "image/jpeg",
        cacheControl: "private, max-age=31536000"
      },
      customMetadata: {
        sessionId: id,
        kind: "raw-photo",
        pose: String(i)
      }
    });

    photoKeys.push(key);
  }

  const receiptKey = `receipts/public/sessions/${id}/receipt.png`;
  await env.LUNA_RECEIPTS.put(receiptKey, await receipt.arrayBuffer(), {
    httpMetadata: {
      contentType: receipt.type || "image/png",
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      sessionId: id,
      kind: "receipt"
    }
  });

  const publicReceiptUrl = `${new URL(request.url).origin}/receipt/${id}.png`;
  const sessionPageUrl = withSessionId(galleryPageUrl, id);

  const sessionRecord = {
    id,
    createdAt,
    receiptKey,
    receiptUrl: publicReceiptUrl,
    privatePhotoKeys: photoKeys
  };

  await env.LUNA_RECEIPTS.put(`receipts/private/sessions/${id}/session.json`, JSON.stringify(sessionRecord, null, 2), {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "private, max-age=31536000"
    }
  });

  const index = await readIndex(env);

  // Newest first.
  index.unshift({
    id,
    createdAt,
    receiptKey,
    receiptUrl: publicReceiptUrl
  });

  await writeIndex(env, index.slice(0, 1000));

  return json({
    ok: true,
    id,
    url: sessionPageUrl,
    receiptUrl: publicReceiptUrl
  }, 200, corsHeaders);
}

async function handleGallery(env, corsHeaders) {
  const index = await readIndex(env);

  return json(index, 200, {
    ...corsHeaders,
    "Cache-Control": "no-store"
  });
}

async function handleSession(url, env, corsHeaders) {
  const id = url.searchParams.get("id");

  if (!id || !isSafeId(id)) {
    return json({ error: "Missing or invalid id" }, 400, corsHeaders);
  }

  const object = await env.LUNA_RECEIPTS.get(`receipts/private/sessions/${id}/session.json`);

  if (!object) {
    return json({ error: "Session not found" }, 404, corsHeaders);
  }

  const record = await object.json();

  // This response deliberately excludes raw/private photo keys.
  return json({
    id: record.id,
    createdAt: record.createdAt,
    receiptUrl: record.receiptUrl
  }, 200, {
    ...corsHeaders,
    "Cache-Control": "no-store"
  });
}

async function handlePublicReceiptAsset(url, env, corsHeaders) {
  const filename = url.pathname.split("/").pop() || "";
  const id = filename.replace(/\.png$/i, "");

  if (!id || !isSafeId(id)) {
    return json({ error: "Invalid receipt id" }, 400, corsHeaders);
  }

  const key = `receipts/public/sessions/${id}/receipt.png`;
  const object = await env.LUNA_RECEIPTS.get(key);

  if (!object) {
    return json({ error: "Receipt not found" }, 404, corsHeaders);
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="luna-receipt-${id}.png"`,
      ...corsHeaders
    }
  });
}

async function readIndex(env) {
  const object = await env.LUNA_RECEIPTS.get(RECEIPT_INDEX_KEY);

  if (!object) return [];

  try {
    const parsed = await object.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(env, index) {
  await env.LUNA_RECEIPTS.put(RECEIPT_INDEX_KEY, JSON.stringify(index, null, 2), {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "no-store"
    }
  });
}

function withSessionId(galleryPageUrl, id) {
  const url = new URL(galleryPageUrl);
  url.searchParams.set("id", id);
  return url.toString();
}

function isSafeId(value) {
  return /^[a-f0-9-]{20,80}$/i.test(value);
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
