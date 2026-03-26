/**
 * 管理画面ルートハンドラ
 *
 * ルーティング:
 *   GET  /admin/login                - ログインページ（認証不要）
 *   POST /admin/login                - ログイン処理（認証不要）
 *   POST /admin/logout               - ログアウト処理
 *   GET  /admin                      - 管理トップ
 *   GET  /admin/reports              - 通報一覧（ページネーション・ステータスフィルタ）
 *   GET  /admin/reports/:id          - 通報詳細
 *   PATCH /admin/reports/:id/status  - ステータス更新（JSON API）
 *
 * ログイン・ログアウト以外の全ルートは requireAuth で保護する。
 */

import type { Env, ReportStatus } from "../../types";
import { getReports, getReportById, updateReportStatus } from "../../lib/db";
import {
  renderAdminTop,
  renderReportList,
  renderReportDetail,
  renderErrorPage,
  renderLoginPage,
} from "./views";
import {
  requireAuth,
  verifyPassword,
  buildSessionCookieHeader,
  buildLogoutCookieHeader,
} from "./auth";

// ---- 定数 -------------------------------------------------------------------

const PAGE_SIZE = 20;

const VALID_STATUSES: readonly ReportStatus[] = [
  "pending",
  "in_progress",
  "resolved",
  "rejected",
];

// ---- ヘルパー ---------------------------------------------------------------

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isValidStatus(s: unknown): s is ReportStatus {
  return typeof s === "string" && (VALID_STATUSES as string[]).includes(s);
}

// ---- メインハンドラ ----------------------------------------------------------

export async function handleAdmin(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method.toUpperCase();

    // pathname を "/" 区切りで分割する
    // 例: /admin         → ["", "admin"]
    //     /admin/reports → ["", "admin", "reports"]
    //     /admin/reports/42        → ["", "admin", "reports", "42"]
    //     /admin/reports/42/status → ["", "admin", "reports", "42", "status"]
    const segments = pathname.split("/");

    // ---- 認証不要ルート -------------------------------------------------------

    // GET /admin/login
    if (method === "GET" && segments[2] === "login" && segments.length === 3) {
      return htmlResponse(renderLoginPage());
    }

    // POST /admin/login
    if (method === "POST" && segments[2] === "login" && segments.length === 3) {
      return await handleLogin(request, env);
    }

    // POST /admin/logout
    if (method === "POST" && segments[2] === "logout" && segments.length === 3) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/admin/login",
          "Set-Cookie": buildLogoutCookieHeader(),
        },
      });
    }

    // ---- 認証が必要なルート ---------------------------------------------------

    const authResponse = await requireAuth(request, env);
    if (authResponse) return authResponse;

    // GET /admin または GET /admin/
    if (
      method === "GET" &&
      (segments.length === 2 ||
        (segments.length === 3 && segments[2] === ""))
    ) {
      return htmlResponse(renderAdminTop());
    }

    // /admin/reports/*
    if (segments[2] === "reports") {
      // GET /admin/reports
      if (method === "GET" && segments.length === 3) {
        return await handleReportList(env, searchParams);
      }

      // GET /admin/reports/:id  または  PATCH /admin/reports/:id/status
      if (segments.length >= 4) {
        const id = parseInt(segments[3] ?? "", 10);
        if (isNaN(id)) {
          return htmlResponse(
            renderErrorPage(400, "通報IDが不正です。"),
            400,
          );
        }

        // GET /admin/reports/:id
        if (method === "GET" && segments.length === 4) {
          return await handleReportDetail(env, id);
        }

        // PATCH /admin/reports/:id/status
        if (
          method === "PATCH" &&
          segments.length === 5 &&
          segments[4] === "status"
        ) {
          return await handleStatusUpdate(request, env, id);
        }
      }
    }

    // マッチしないルート → 404
    return htmlResponse(
      renderErrorPage(404, "ページが見つかりません。"),
      404,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Admin handler error:", err);
    return htmlResponse(
      renderErrorPage(500, "サーバーエラーが発生しました。"),
      500,
    );
  }
}

// ---- 認証ルートハンドラ ------------------------------------------------------

async function handleLogin(request: Request, env: Env): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return htmlResponse(renderLoginPage("リクエストの形式が不正です。"), 400);
  }

  const username = formData.get("username");
  const password = formData.get("password");

  // ユーザー名・パスワードをログに出さない
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== env.ADMIN_USERNAME ||
    !(await verifyPassword(password, env.ADMIN_PASSWORD_HASH))
  ) {
    return htmlResponse(
      renderLoginPage("ユーザー名またはパスワードが違います。"),
      401,
    );
  }

  const sessionCookie = await buildSessionCookieHeader(env.ADMIN_SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin",
      "Set-Cookie": sessionCookie,
    },
  });
}

// ---- 管理ルートハンドラ ------------------------------------------------------

async function handleReportList(
  env: Env,
  searchParams: URLSearchParams,
): Promise<Response> {
  // ステータスフィルタ
  const rawStatus = searchParams.get("status") ?? "";
  const status = isValidStatus(rawStatus) ? rawStatus : undefined;

  // ページネーション
  const rawPage = searchParams.get("page") ?? "1";
  const currentPage = Math.max(1, parseInt(rawPage, 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const result = await getReports(env.DB, {
    status,
    limit: PAGE_SIZE,
    offset,
  });

  return htmlResponse(renderReportList(result, currentPage, status));
}

async function handleReportDetail(env: Env, id: number): Promise<Response> {
  const report = await getReportById(env.DB, id);
  if (!report) {
    return htmlResponse(
      renderErrorPage(404, `通報 ID:${id} が見つかりません。`),
      404,
    );
  }
  return htmlResponse(renderReportDetail(report));
}

async function handleStatusUpdate(
  request: Request,
  env: Env,
  id: number,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "リクエストボディが不正です。" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !isValidStatus((body as Record<string, unknown>).status)
  ) {
    return jsonResponse(
      {
        error: `status は "pending", "in_progress", "resolved", "rejected" のいずれかを指定してください。`,
      },
      400,
    );
  }

  const newStatus = (body as Record<string, unknown>).status as ReportStatus;
  const updated = await updateReportStatus(env.DB, id, newStatus);

  if (!updated) {
    return jsonResponse(
      { error: `通報 ID:${id} が見つかりません。` },
      404,
    );
  }

  return jsonResponse({ report: updated });
}
