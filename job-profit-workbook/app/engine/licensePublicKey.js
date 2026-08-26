/**
 * Company public key for verifying signed trial and paid entitlements.
 * The matching private key exists only in the issuing environment as a secret.
 * It must never ship in the installer, client, or Git.
 *
 * Production key rotation: generate a new Ed25519 pair on the issuing side,
 * store the private key only as a host secret, ship this public key in a client
 * update, and re-issue entitlements. Retired prototype keys are not verified.
 */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAOGFWLhjn6eoinwgRKYPYlxsb3DLDQzS1gGGcqdBKfIw=
-----END PUBLIC KEY-----
`;
