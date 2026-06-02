// Luna Wedding Receipt Gallery Configuration
// Public browser-safe config only.
// Do not place Supabase service-role keys or admin passwords in this file.

window.LUNA_RECEIPTS_CONFIG = {
  SUPABASE_URL: "https://vlmmfqjrrkdjvwuryixj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_nflibjeMzzKdOJu-5Zn7EA_1FwUbqUE",

  TABLE_NAME: "public_receipt_sessions",

  // Public gallery settings
  PAGE_SIZE: 48,
  SITE_NAME: "Luna Wedding",
  RECEIPTS_PATH: "/receipts/",

  // Field names from booth_sessions
  FIELDS: {
    publicSessionId: "public_session_id",
    createdAt: "created_at",
    galleryUrl: "gallery_url",
    receiptPublicUrl: "receipt_public_url",
    isPublic: "is_public"
  }
};

// Backward compatibility for any older code still checking this.
// We are no longer relying on the Cloudflare Worker for the public gallery.
window.LUNA_RECEIPT_API = "";
