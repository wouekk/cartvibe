import 'package:flutter/material.dart';
import 'package:receipt_wrangler_mobile/services/token_refresh_service.dart';

import '../utils/currency.dart';

Future<String?> protectedRouteRedirect(
    BuildContext _, String? redirect) async {
  var tokensValid = await TokenRefreshService().refreshTokens();
  var redirectRoute = redirect ?? "/";

  if (tokensValid) {
    return null;
  } else {
    return redirectRoute;
  }
}

Future<String?> unprotectedRouteRedirect(
    BuildContext context, String? redirect) async {
  var tokensValid = await TokenRefreshService().refreshTokens();
  var redirectRoute = redirect ?? "/";

  if (tokensValid) {
    registerCustomCurrency(context);
    return redirectRoute;
  } else {
    return null;
  }
}
