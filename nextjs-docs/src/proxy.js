import { NextResponse } from "next/server";

export function proxy(request) {
  console.log("Proxying request...");
  console.log(request.headers);
  console.log({env: process.env})
  const response = NextResponse.next();

  response.headers.set(
    "X-Vercel-Deployment-Id",
    process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.DEPLOYMENT_ID ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "local"
  );
  response.headers.set(
    "X-Vercel-Project-Id",
    process.env.VERCEL_PROJECT_ID ||
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID ||
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
