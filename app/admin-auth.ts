import {env} from "cloudflare:workers";
export function getAdminPassword() {
  const value = (env as { ADMIN_PASSWORD?: string }).ADMIN_PASSWORD;
  return typeof value === "string" && value ? value : "@dm!N4CtS";
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token || "" : "";
}


export function authorized(request:Request){return getBearerToken(request)===getAdminPassword();}
