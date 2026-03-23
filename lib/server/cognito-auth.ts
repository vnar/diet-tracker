import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getServerCognitoConfig } from "@/lib/cognito-config";

type Verifier = ReturnType<typeof CognitoJwtVerifier.create>;

let verifier: Verifier | null = null;

function getVerifier(): Verifier | null {
  const config = getServerCognitoConfig();
  if (!config) return null;

  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: "access",
      clientId: config.userPoolClientId,
    });
  }

  return verifier;
}

export async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;

  const token = header.slice("bearer ".length).trim();
  if (!token) return null;

  const jwtVerifier = getVerifier();
  if (!jwtVerifier) return null;

  try {
    const payload = await jwtVerifier.verify(token);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
