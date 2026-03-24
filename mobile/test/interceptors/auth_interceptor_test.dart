import 'dart:async';

import 'package:built_collection/built_collection.dart';
import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:one_of/any_of.dart';
import 'package:openapi/openapi.dart';
import 'package:receipt_wrangler_mobile/client/client.dart';
import 'package:receipt_wrangler_mobile/interceptors/auth_interceptor.dart';
import 'package:receipt_wrangler_mobile/models/auth_model.dart';
import 'package:receipt_wrangler_mobile/models/category_model.dart';
import 'package:receipt_wrangler_mobile/models/group_model.dart';
import 'package:receipt_wrangler_mobile/models/system_settings_model.dart';
import 'package:receipt_wrangler_mobile/models/tag_model.dart';
import 'package:receipt_wrangler_mobile/models/user_model.dart';
import 'package:receipt_wrangler_mobile/models/user_preferences_model.dart';
import 'package:receipt_wrangler_mobile/services/token_refresh_service.dart';

// --- Mocks ---

class MockAuthModel extends Mock implements AuthModel {}

class MockGroupModel extends Mock implements GroupModel {}

class MockUserModel extends Mock implements UserModel {}

class MockUserPreferencesModel extends Mock implements UserPreferencesModel {}

class MockCategoryModel extends Mock implements CategoryModel {}

class MockTagModel extends Mock implements TagModel {}

class MockSystemSettingsModel extends Mock implements SystemSettingsModel {}

class MockOpenapi extends Mock implements Openapi {}

class MockAuthApi extends Mock implements AuthApi {}

class MockUserApi extends Mock implements UserApi {}

class MockGroup extends Mock implements Group {}

class FakeLogoutCommand extends Fake implements LogoutCommand {}

// --- Helpers ---

String createTestJwt({required DateTime exp}) {
  final jwt = JWT({'exp': exp.millisecondsSinceEpoch ~/ 1000});
  return jwt.sign(SecretKey('test-secret'));
}

String get validJwt =>
    createTestJwt(exp: DateTime.now().add(const Duration(hours: 1)));

String get expiredJwt =>
    createTestJwt(exp: DateTime.now().subtract(const Duration(hours: 1)));

Response<GetNewRefreshToken200Response> createTokenRefreshResponse(
    String jwt, String refreshToken) {
  final tokenPair = TokenPair((b) => b
    ..jwt = jwt
    ..refreshToken = refreshToken);
  final anyOf = AnyOf2<TokenPair, Claims>(values: {0: tokenPair});
  final responseData =
      (GetNewRefreshToken200ResponseBuilder()..anyOf = anyOf).build();
  return Response(
    data: responseData,
    requestOptions: RequestOptions(path: '/token/'),
    statusCode: 200,
  );
}

/// Tracks which handler method was called by the interceptor.
/// Uses noSuchMethod to satisfy _BaseHandler mixin requirements
/// without triggering Dio's internal Completer plumbing.
class TestErrorHandler with _NoopBaseHandler implements ErrorInterceptorHandler {
  final Completer<String> _actionCompleter = Completer<String>();
  Response? resolvedResponse;
  DioException? nextError;

  Future<String> get result => _actionCompleter.future;

  @override
  void next(DioException err) {
    nextError = err;
    if (!_actionCompleter.isCompleted) _actionCompleter.complete('next');
  }

  @override
  void resolve(Response response) {
    resolvedResponse = response;
    if (!_actionCompleter.isCompleted) _actionCompleter.complete('resolve');
  }

  @override
  void reject(DioException err) {
    if (!_actionCompleter.isCompleted) _actionCompleter.complete('reject');
  }
}

/// Mixin that provides noSuchMethod to satisfy unimplemented members
/// of Dio's _BaseHandler (future, isCompleted).
mixin _NoopBaseHandler {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

void main() {
  late MockAuthModel mockAuthModel;
  late MockGroupModel mockGroupModel;
  late AuthInterceptor interceptor;

  setUpAll(() {
    registerFallbackValue(FakeLogoutCommand());
  });

  setUp(() {
    mockAuthModel = MockAuthModel();
    mockGroupModel = MockGroupModel();

    TokenRefreshService().resetForTesting();
    TokenRefreshService().initialize(
      authModel: mockAuthModel,
      groupModel: mockGroupModel,
      userModel: MockUserModel(),
      userPreferencesModel: MockUserPreferencesModel(),
      categoryModel: MockCategoryModel(),
      tagModel: MockTagModel(),
      systemSettingsModel: MockSystemSettingsModel(),
    );

    interceptor = AuthInterceptor();
  });

  group('AuthInterceptor', () {
    test('passes through non-401/403 errors without interception', () async {
      final requestOptions = RequestOptions(path: '/receipts');
      final error = DioException(
        requestOptions: requestOptions,
        response: Response(
          statusCode: 500,
          requestOptions: requestOptions,
        ),
      );

      final handler = TestErrorHandler();
      interceptor.onError(error, handler);

      final action = await handler.result.timeout(const Duration(seconds: 2));
      expect(action, 'next');
    });

    test('passes through errors for /token/ endpoint without retry', () async {
      final requestOptions = RequestOptions(path: '/token/');
      final error = DioException(
        requestOptions: requestOptions,
        response: Response(
          statusCode: 403,
          requestOptions: requestOptions,
        ),
      );

      final handler = TestErrorHandler();
      interceptor.onError(error, handler);

      final action = await handler.result.timeout(const Duration(seconds: 2));
      expect(action, 'next');
    });

    test('passes through errors that already have X-Token-Retry header',
        () async {
      final requestOptions = RequestOptions(
        path: '/receipts',
        headers: {'X-Token-Retry': 'true'},
      );
      final error = DioException(
        requestOptions: requestOptions,
        response: Response(
          statusCode: 403,
          requestOptions: requestOptions,
        ),
      );

      final handler = TestErrorHandler();
      interceptor.onError(error, handler);

      final action = await handler.result.timeout(const Duration(seconds: 2));
      expect(action, 'next');
    });

    test('attempts refresh on 401 and retries request on success', () async {
      final newJwt = validJwt;
      final newRefresh = validJwt;

      // Set up mock API client for TokenRefreshService to use
      final mockOpenapi = MockOpenapi();
      final mockAuthApi = MockAuthApi();
      final mockUserApi = MockUserApi();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8081/api'));

      when(() => mockOpenapi.getAuthApi()).thenReturn(mockAuthApi);
      when(() => mockOpenapi.getUserApi()).thenReturn(mockUserApi);
      when(() => mockOpenapi.dio).thenReturn(dio);

      // Mock token refresh endpoint (used by TokenRefreshService → getAndSetTokens)
      when(() => mockAuthApi.getNewRefreshToken(
              logoutCommand: any(named: 'logoutCommand')))
          .thenAnswer(
              (_) async => createTokenRefreshResponse(newJwt, newRefresh));

      // Mock auth model methods
      when(() => mockAuthModel.getJwt()).thenAnswer((_) async => expiredJwt);
      when(() => mockAuthModel.getRefreshToken())
          .thenAnswer((_) async => validJwt);
      when(() => mockAuthModel.setJwt(any())).thenAnswer((_) async {});
      when(() => mockAuthModel.setRefreshToken(any()))
          .thenAnswer((_) async {});
      when(() => mockGroupModel.groups)
          .thenReturn([MockGroup()]);

      OpenApiClient.client = mockOpenapi;

      // After successful refresh, getCurrentJwt returns the new token
      // (re-stub getJwt to return new token after refresh completes)
      var refreshed = false;
      when(() => mockAuthModel.setJwt(any())).thenAnswer((_) async {
        refreshed = true;
      });
      when(() => mockAuthModel.getJwt()).thenAnswer((_) async {
        return refreshed ? newJwt : expiredJwt;
      });

      // Set up Dio to resolve retry requests
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.headers.containsKey('X-Token-Retry')) {
            handler.resolve(Response(
              data: {'success': true},
              statusCode: 200,
              requestOptions: options,
            ));
          } else {
            handler.next(options);
          }
        },
      ));

      // Create the original 401 error
      final requestOptions = RequestOptions(path: '/receipts');
      final error = DioException(
        requestOptions: requestOptions,
        response: Response(
          statusCode: 401,
          requestOptions: requestOptions,
        ),
      );

      final handler = TestErrorHandler();
      interceptor.onError(error, handler);

      final action = await handler.result.timeout(const Duration(seconds: 5));
      expect(action, 'resolve',
          reason: 'Should resolve with retried response');
      expect(handler.resolvedResponse?.statusCode, 200);
    });

    test('attempts refresh on 403 and retries request on success', () async {
      final newJwt = validJwt;
      final newRefresh = validJwt;

      final mockOpenapi = MockOpenapi();
      final mockAuthApi = MockAuthApi();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8081/api'));

      when(() => mockOpenapi.getAuthApi()).thenReturn(mockAuthApi);
      when(() => mockOpenapi.getUserApi()).thenReturn(MockUserApi());
      when(() => mockOpenapi.dio).thenReturn(dio);

      when(() => mockAuthApi.getNewRefreshToken(
              logoutCommand: any(named: 'logoutCommand')))
          .thenAnswer(
              (_) async => createTokenRefreshResponse(newJwt, newRefresh));

      when(() => mockAuthModel.getJwt()).thenAnswer((_) async => expiredJwt);
      when(() => mockAuthModel.getRefreshToken())
          .thenAnswer((_) async => validJwt);
      when(() => mockAuthModel.setJwt(any())).thenAnswer((_) async {});
      when(() => mockAuthModel.setRefreshToken(any()))
          .thenAnswer((_) async {});
      when(() => mockGroupModel.groups)
          .thenReturn([MockGroup()]);

      var refreshed = false;
      when(() => mockAuthModel.setJwt(any())).thenAnswer((_) async {
        refreshed = true;
      });
      when(() => mockAuthModel.getJwt()).thenAnswer((_) async {
        return refreshed ? newJwt : expiredJwt;
      });

      OpenApiClient.client = mockOpenapi;

      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.headers.containsKey('X-Token-Retry')) {
            handler.resolve(Response(
              data: {'success': true},
              statusCode: 200,
              requestOptions: options,
            ));
          } else {
            handler.next(options);
          }
        },
      ));

      final requestOptions = RequestOptions(path: '/receipts');
      final error = DioException(
        requestOptions: requestOptions,
        response: Response(
          statusCode: 403,
          requestOptions: requestOptions,
        ),
      );

      final handler = TestErrorHandler();
      interceptor.onError(error, handler);

      final action = await handler.result.timeout(const Duration(seconds: 5));
      expect(action, 'resolve',
          reason: 'Should resolve with retried response on 403');
    });

    test('falls through to next when token refresh fails', () async {
      when(() => mockAuthModel.getJwt()).thenAnswer((_) async => expiredJwt);
      when(() => mockAuthModel.getRefreshToken())
          .thenAnswer((_) async => expiredJwt);
      when(() => mockAuthModel.purgeTokens()).thenAnswer((_) async {});

      final requestOptions = RequestOptions(path: '/receipts');
      final error = DioException(
        requestOptions: requestOptions,
        response: Response(
          statusCode: 401,
          requestOptions: requestOptions,
        ),
      );

      final handler = TestErrorHandler();
      interceptor.onError(error, handler);

      final action = await handler.result.timeout(const Duration(seconds: 5));
      expect(action, 'next',
          reason: 'Should pass error through when refresh fails');
    });

    test('sets Authorization header with new JWT on retry', () async {
      final newJwt = validJwt;
      final newRefresh = validJwt;

      final mockOpenapi = MockOpenapi();
      final mockAuthApi = MockAuthApi();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8081/api'));

      when(() => mockOpenapi.getAuthApi()).thenReturn(mockAuthApi);
      when(() => mockOpenapi.getUserApi()).thenReturn(MockUserApi());
      when(() => mockOpenapi.dio).thenReturn(dio);

      when(() => mockAuthApi.getNewRefreshToken(
              logoutCommand: any(named: 'logoutCommand')))
          .thenAnswer(
              (_) async => createTokenRefreshResponse(newJwt, newRefresh));

      when(() => mockAuthModel.getJwt()).thenAnswer((_) async => expiredJwt);
      when(() => mockAuthModel.getRefreshToken())
          .thenAnswer((_) async => validJwt);
      when(() => mockAuthModel.setJwt(any())).thenAnswer((_) async {});
      when(() => mockAuthModel.setRefreshToken(any()))
          .thenAnswer((_) async {});
      when(() => mockGroupModel.groups)
          .thenReturn([MockGroup()]);

      var refreshed = false;
      when(() => mockAuthModel.setJwt(any())).thenAnswer((_) async {
        refreshed = true;
      });
      when(() => mockAuthModel.getJwt()).thenAnswer((_) async {
        return refreshed ? newJwt : expiredJwt;
      });

      OpenApiClient.client = mockOpenapi;

      // Capture the Authorization header on retry
      String? capturedAuthHeader;
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.headers.containsKey('X-Token-Retry')) {
            capturedAuthHeader = options.headers['Authorization'] as String?;
            handler.resolve(Response(
              data: {'success': true},
              statusCode: 200,
              requestOptions: options,
            ));
          } else {
            handler.next(options);
          }
        },
      ));

      final requestOptions = RequestOptions(path: '/receipts');
      final error = DioException(
        requestOptions: requestOptions,
        response: Response(
          statusCode: 401,
          requestOptions: requestOptions,
        ),
      );

      final handler = TestErrorHandler();
      interceptor.onError(error, handler);

      await handler.result.timeout(const Duration(seconds: 5));

      expect(capturedAuthHeader, 'Bearer $newJwt',
          reason: 'Retry should include new JWT in Authorization header');
    });
  });
}
