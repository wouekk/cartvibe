import 'package:built_collection/built_collection.dart';
import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';
import 'package:one_of/any_of.dart';
import 'package:openapi/openapi.dart';
import 'package:receipt_wrangler_mobile/models/auth_model.dart';
import 'package:receipt_wrangler_mobile/models/category_model.dart';
import 'package:receipt_wrangler_mobile/models/group_model.dart';
import 'package:receipt_wrangler_mobile/models/system_settings_model.dart';
import 'package:receipt_wrangler_mobile/models/tag_model.dart';
import 'package:receipt_wrangler_mobile/models/user_model.dart';
import 'package:receipt_wrangler_mobile/models/user_preferences_model.dart';

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

/// Creates a signed JWT with the given expiration.
String createTestJwt({required DateTime exp}) {
  final jwt = JWT({'exp': exp.millisecondsSinceEpoch ~/ 1000});
  return jwt.sign(SecretKey('test-secret'));
}

String get validJwt =>
    createTestJwt(exp: DateTime.now().add(const Duration(hours: 1)));

String get expiredJwt =>
    createTestJwt(exp: DateTime.now().subtract(const Duration(hours: 1)));

/// Creates a mock token refresh response wrapping the given token pair.
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
