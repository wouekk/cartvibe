import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:receipt_wrangler_mobile/services/token_refresh_service.dart';

import '../models/auth_model.dart';
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
  var authModelProvider = Provider.of<AuthModel>(context, listen: false);
  var tokensValid = await TokenRefreshService().refreshTokens();
  var redirectRoute = redirect ?? "/";

  if (tokensValid) {
    registerCustomCurrency(context);
    return redirectRoute;
  } else {
    await authModelProvider.purgeTokens();
    return null;
  }
}
