import { NextResponse } from "next/server";

export function proxy(request) {
  console.log("Proxying request...");
  console.log(request.headers);
  const response = NextResponse.next();

  response.headers.set(
    "X-Vercel-Deployment-Id",
    process.env.VERCEL_DEPLOYMENT_ID ||
      "local"
  );
  response.headers.set(
    "X-Vercel-Project-Id",
    process.env.VERCEL_PROJECT_ID ||
      "prj"
  );
  response.headers.set(
    "X-Vercel-Deployment-URL",
    process.env.VERCEL_URL || "http://localhost:3000"
  );

  return response;
}

export const config = {
  matcher: "/:path*"
};
