import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const source = await readFile(new URL("./index.js", import.meta.url), "utf8");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");
const fromBase64Url = (value) => new Uint8Array(Buffer.from(value, "base64url"));

test("scheduled Web Push uses VAPID and sends decryptable encrypted reminders", async () => {
    const records = new Map();
    const kv = {
        async put(key, value) { records.set(key, value); },
        async get(key) { return records.get(key) || null; },
        async delete(key) { records.delete(key); },
        async list({ prefix }) {
            return {
                keys: [...records.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
                list_complete: true
            };
        }
    };
    const vapidPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const vapidPrivate = await crypto.subtle.exportKey("jwk", vapidPair.privateKey);
    const vapidPublic = await crypto.subtle.exportKey("jwk", vapidPair.publicKey);
    const vapidPublicKey = toBase64Url(new Uint8Array([4, ...fromBase64Url(vapidPublic.x), ...fromBase64Url(vapidPublic.y)]));
    const browserPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const browserPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", browserPair.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-endpoint";
    const subscription = {
        endpoint,
        keys: { p256dh: toBase64Url(browserPublicKey), auth: toBase64Url(authSecret) }
    };
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now).map(({ type, value }) => [type, value]));
    const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    const clientId = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const origin = "https://surajshukla22051-prog.github.io";
    const env = {
        ALLOWED_ORIGINS: origin,
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_JWK: JSON.stringify(vapidPrivate),
        VAPID_SUBJECT: origin,
        SITE_URL: `${origin}/LT-lifetracker/`,
        PUSH_SUBSCRIPTIONS: kv
    };
    const originalFetch = globalThis.fetch;
    let pushRequest;
    globalThis.fetch = async (url, options) => {
        pushRequest = { url: String(url), options };
        return new Response(null, { status: 201 });
    };

    try {
        const keyResponse = await worker.fetch(new Request("https://worker.test/api/push/key", {
            headers: { Origin: origin }
        }), env, {});
        assert.equal(keyResponse.status, 200);
        assert.equal((await keyResponse.json()).publicKey, vapidPublicKey);

        const schedule = {
            action: "save",
            clientId,
            subscription,
            timeZone,
            reminders: [{ id: "water", title: "Drink water", time: "00:00" }]
        };
        const saveResponse = await worker.fetch(new Request("https://worker.test/api/push/subscription", {
            method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify(schedule)
        }), env, {});
        assert.equal(saveResponse.status, 200);

        const invalidEndpoint = await worker.fetch(new Request("https://worker.test/api/push/subscription", {
            method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ ...schedule, subscription: { ...subscription, endpoint: "https://127.0.0.1/private" } })
        }), env, {});
        assert.equal(invalidEndpoint.status, 400);

        const deniedOrigin = await worker.fetch(new Request("https://worker.test/api/push/key", {
            headers: { Origin: "https://untrusted.invalid" }
        }), env, {});
        assert.equal(deniedOrigin.status, 403);

        await worker.scheduled({}, env, {});
        assert.ok(pushRequest);
        assert.equal(pushRequest.url, endpoint);
        assert.equal(pushRequest.options.headers["Content-Encoding"], "aes128gcm");

        const authorization = /^vapid t=([^,]+), k=(.+)$/.exec(pushRequest.options.headers.Authorization);
        assert.ok(authorization);
        const [jwtHeader, jwtClaims, jwtSignature] = authorization[1].split(".");
        const claims = JSON.parse(Buffer.from(jwtClaims, "base64url").toString());
        assert.equal(claims.aud, new URL(endpoint).origin);
        assert.equal(await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            vapidPair.publicKey,
            fromBase64Url(jwtSignature),
            new TextEncoder().encode(`${jwtHeader}.${jwtClaims}`)
        ), true);

        const encrypted = new Uint8Array(pushRequest.options.body);
        const salt = encrypted.slice(0, 16);
        assert.equal(new DataView(encrypted.buffer, encrypted.byteOffset + 16, 4).getUint32(0), 4096);
        const appKeyLength = encrypted[20];
        const appPublicKey = encrypted.slice(21, 21 + appKeyLength);
        const ciphertext = encrypted.slice(21 + appKeyLength);
        const appKey = await crypto.subtle.importKey("raw", appPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
        const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
            { name: "ECDH", public: appKey },
            browserPair.privateKey,
            256
        ));
        const hmac = async (key, message) => new Uint8Array(await crypto.subtle.sign(
            "HMAC",
            await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
            message
        ));
        const keyInfo = new Uint8Array([
            ...new TextEncoder().encode("WebPush: info\0"),
            ...browserPublicKey,
            ...appPublicKey
        ]);
        const authPrk = await hmac(authSecret, sharedSecret);
        const inputKeyMaterial = await hmac(authPrk, new Uint8Array([...keyInfo, 1]));
        const prk = await hmac(salt, inputKeyMaterial);
        const contentKey = (await hmac(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"))).slice(0, 16);
        const nonce = (await hmac(prk, new TextEncoder().encode("Content-Encoding: nonce\0"))).slice(0, 12);
        const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["decrypt"]);
        const plaintext = new Uint8Array(await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonce, tagLength: 128 },
            aesKey,
            ciphertext
        ));
        assert.equal(plaintext.at(-1), 2);
        const message = JSON.parse(new TextDecoder().decode(plaintext.slice(0, -1)));
        assert.equal(message.reminders[0].title, "Drink water");
        assert.equal(JSON.parse([...records.values()][0]).reminders[0].lastSent, today);

        const removeResponse = await worker.fetch(new Request("https://worker.test/api/push/subscription", {
            method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", clientId })
        }), env, {});
        assert.equal(removeResponse.status, 200);
        assert.equal(records.size, 0);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("assistant reports the bounded Groq error detail when Groq rejects a request", async () => {
    const origin = "https://surajshukla22051-prog.github.io";
    const env = {
        ALLOWED_ORIGINS: origin,
        GROQ_API_KEY: "test-key",
        GROQ_MODEL: "openai/gpt-oss-120b"
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
        error: { message: "Unsupported parameter: temperature", type: "invalid_request_error" }
    }), { status: 400, headers: { "Content-Type": "application/json" } });

    try {
        const result = await worker.fetch(new Request("https://worker.test/api/assistant", {
            method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({
                context: { habits: [] },
                messages: [{ role: "user", content: "Hello." }]
            })
        }), env, {});

        assert.equal(result.status, 502);
        assert.deepEqual(await result.json(), {
            error: "Groq request failed (HTTP 400): Unsupported parameter: temperature"
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("assistant accepts and forwards the latest 24 chat exchanges", async () => {
    const origin = "https://surajshukla22051-prog.github.io";
    const env = {
        ALLOWED_ORIGINS: origin,
        GROQ_API_KEY: "test-key",
        GROQ_MODEL: "openai/gpt-oss-120b"
    };
    const originalFetch = globalThis.fetch;
    let groqMessages;
    globalThis.fetch = async (_url, options) => {
        groqMessages = JSON.parse(options.body).messages;
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ reply: "I remember.", actions: [] }) } }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    try {
        const messages = Array.from({ length: 48 }, (_, index) => ({
            role: index === 47 ? "user" : index % 2 === 0 ? "user" : "assistant",
            content: `chat-${index} ${"x".repeat(690)}`
        }));
        const result = await worker.fetch(new Request("https://worker.test/api/assistant", {
            method: "POST",
            headers: {
                Origin: origin,
                "CF-Connecting-IP": "memory-test",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ context: { habits: [] }, messages })
        }), env, {});

        assert.equal(result.status, 200);
        assert.equal(groqMessages.length, 50);
        assert.match(groqMessages[2].content, /^chat-0 /);
        assert.match(groqMessages.at(-1).content, /^chat-47 /);

        const tooManyMessages = await worker.fetch(new Request("https://worker.test/api/assistant", {
            method: "POST",
            headers: {
                Origin: origin,
                "CF-Connecting-IP": "memory-limit-test",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                context: { habits: [] },
                messages: [...messages, { role: "assistant", content: "extra" }]
            })
        }), env, {});
        assert.equal(tooManyMessages.status, 400);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
