import 'dart:convert';

import 'package:http/http.dart' as http;

import 'env.dart';

/// Logs into the Go API as the admin and returns the JWT cookie value.
///
/// The API issues auth via `Set-Cookie: jwt=…` (the body's `jwt` field
/// is empty — confirmed against a live demo response). We just parse
/// the cookie out of the Set-Cookie header.
Future<String> apiLogin() async {
  final res = await http
      .post(
        Uri.parse('${E2eEnv.baseUrl}/login/'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'username': E2eEnv.adminUsername,
          'password': E2eEnv.adminPassword,
        }),
      )
      .timeout(const Duration(seconds: 10));

  if (res.statusCode != 200) {
    throw StateError(
      'apiLogin failed: HTTP ${res.statusCode}: ${res.body}',
    );
  }
  final setCookie = res.headers['set-cookie'] ?? '';
  final match = RegExp(r'jwt=([^;]+)').firstMatch(setCookie);
  if (match == null) {
    throw StateError(
      'apiLogin succeeded but no jwt cookie in Set-Cookie: $setCookie',
    );
  }
  return match.group(1)!;
}

/// Best-effort DELETE of a receipt. Swallows errors so cleanup failures
/// don't mask test failures. Auth is via the Cookie header, matching how
/// the production API consumes it.
Future<void> deleteReceipt(int receiptId, {required String jwt}) async {
  try {
    await http
        .delete(
          Uri.parse('${E2eEnv.baseUrl}/receipt/$receiptId'),
          headers: {'Cookie': 'jwt=$jwt'},
        )
        .timeout(const Duration(seconds: 5));
  } catch (_) {
    // Swallowed on purpose -- best-effort cleanup.
  }
}

/// GETs a receipt by id and returns the parsed JSON body. Used by tests
/// that want to assert server-side state (e.g. "the receipt has 1 image"
/// or "1 item") rather than just the URL we landed on.
Future<Map<String, dynamic>> getReceipt(
  int receiptId, {
  required String jwt,
}) async {
  final res = await http
      .get(
        Uri.parse('${E2eEnv.baseUrl}/receipt/$receiptId'),
        headers: {'Cookie': 'jwt=$jwt'},
      )
      .timeout(const Duration(seconds: 10));
  if (res.statusCode != 200) {
    throw StateError(
      'getReceipt($receiptId) failed: HTTP ${res.statusCode}: ${res.body}',
    );
  }
  return jsonDecode(res.body) as Map<String, dynamic>;
}

/// Lists the latest [limit] receipts in [groupId] (newest first by id).
/// Used for "exactly one receipt with this name" assertions in flows
/// that need to detect duplicates server-side. Filters client-side --
/// the server's filter shape is fiddly and we only care about a small
/// recent window.
Future<List<Map<String, dynamic>>> listReceiptsForGroup(
  int groupId, {
  required String jwt,
  int limit = 50,
}) async {
  final res = await http
      .post(
        Uri.parse('${E2eEnv.baseUrl}/receipt/group/$groupId'),
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'jwt=$jwt',
        },
        body: jsonEncode({
          'page': 1,
          'pageSize': limit,
          // No `orderBy` -- the API rejects "id" with HTTP 500
          // ("Error getting receipts"), and the default ordering
          // returns newest first which is what we want anyway.
          'sortDirection': 'desc',
        }),
      )
      .timeout(const Duration(seconds: 10));
  if (res.statusCode != 200) {
    throw StateError(
      'listReceiptsForGroup($groupId) failed: '
      'HTTP ${res.statusCode}: ${res.body}',
    );
  }
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  return ((body['data'] as List?) ?? const [])
      .cast<Map<String, dynamic>>();
}
