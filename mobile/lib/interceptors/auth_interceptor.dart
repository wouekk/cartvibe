import 'package:dio/dio.dart';
import 'package:receipt_wrangler_mobile/client/client.dart';
import 'package:receipt_wrangler_mobile/services/token_refresh_service.dart';

/// Dio interceptor that catches 401/403 responses, attempts a token
/// refresh via [TokenRefreshService], and retries the original request.
///
/// Mirrors the desktop's http-interceptor.ts behavior.
class AuthInterceptor extends Interceptor {
  static const _retryHeader = 'X-Token-Retry';

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final statusCode = err.response?.statusCode;

    // Don't intercept token refresh requests — let TokenRefreshService handle those errors
    if (err.requestOptions.path.contains('/token/')) {
      return handler.next(err);
    }

    // Don't retry if we already retried this request
    if (err.requestOptions.headers.containsKey(_retryHeader)) {
      return handler.next(err);
    }

    if (statusCode == 401 || statusCode == 403) {
      try {
        final success =
            await TokenRefreshService().refreshTokens(force: true);
        if (success) {
          final jwt = await TokenRefreshService().getCurrentJwt();
          final opts = err.requestOptions;
          opts.headers[_retryHeader] = 'true';
          if (jwt != null) {
            opts.headers['Authorization'] = 'Bearer $jwt';
          }

          // Retry the request using the current client's Dio instance
          final retryResponse = await OpenApiClient.client.dio.fetch(opts);
          return handler.resolve(retryResponse);
        }
      } catch (_) {
        // Refresh failed — fall through to original error
      }
    }

    return handler.next(err);
  }
}
