import jwt from "jsonwebtoken";
import { Request } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "your-very-secure-secret";

interface JwtPayload {
  userId: string;
  name: string | undefined;
  avatar: string | undefined;
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
};

export const verifyToken = (token: string | null): JwtPayload => {
  if (!token) {
    return { userId: "", name: "", avatar: "" };
  }
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
  // try {
  //   return jwt.verify(token, JWT_SECRET) as JwtPayload;
  // } catch (err) {
  //   console.error("Token verification failed:", err);
  //   return { userId: "" };
  // }
};

export const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  return authHeader?.split(" ")[1] || null;
};
export const generateJdyToken = (userid, redirect_uri?: string) => {
  const secret = process.env.JDYSSO_SECRET || "";
  // 创建响应令牌
  return jwt.sign(
    {
      type: "sso_res",
      username: userid,
      redirect_uri,
    },
    secret,
    {
      algorithm: "HS256", // 使用HS256算法
      expiresIn: 60000, // 1分钟后过期
      audience: "com.jiandaoyun", // 目标受众
    }
  );
};

export const verifyJdyToken = (request: string | null) => {
  if (!request) {
    // console.log("No request");
    return true;
  }
  const secret = process.env.JDYSSO_SECRET || "";
  const decoded = jwt.verify(request, secret, {
    algorithms: ["HS256", "HS384", "HS512"],
    // audience: config.issuer,
    issuer: "com.jiandaoyun",
    clockTolerance: 3600,
  });
  if (decoded?.["type"] !== "sso_req") {
    console.log("Invalid token type");
    return false;
  }
  return true;
};
