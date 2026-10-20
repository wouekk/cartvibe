//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

import 'dart:async';

import 'package:built_value/json_object.dart';
import 'package:built_value/serializer.dart';
import 'package:dio/dio.dart';

import 'package:built_collection/built_collection.dart';
import 'package:openapi/src/api_util.dart';
import 'package:openapi/src/model/group_overview.dart';
import 'package:openapi/src/model/group_overview_product.dart';
import 'package:openapi/src/model/internal_error_response.dart';

class OverviewApi {

  final Dio _dio;

  final Serializers _serializers;

  const OverviewApi(this._dio, this._serializers);

  /// Get the group&#39;s period at a glance
  /// This will get a month&#39;s spend, receipt counts, spending by category and the six-month trend ending with it, over the receipts the caller can see [group.receipts.read]
  ///
  /// Parameters:
  /// * [groupId] - Id of the group to describe; the All group spans every group the caller can read
  /// * [month] - Month to describe, yyyy-MM. Defaults to the current month in the app time zone.
  /// * [from] - First day to describe, yyyy-MM-dd. With to, replaces month; the period before it (the previous calendar months for whole months, otherwise the same number of days) is the comparison.
  /// * [to] - Last day to describe, yyyy-MM-dd
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [GroupOverview] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<GroupOverview>> getGroupOverview({ 
    required int groupId,
    String? month,
    String? from,
    String? to,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/overview/group/{groupId}'.replaceAll('{' r'groupId' '}', encodeQueryParameter(_serializers, groupId, const FullType(int)).toString());
    final _options = Options(
      method: r'GET',
      headers: <String, dynamic>{
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'apiKey',
            'name': 'apiKeyAuth',
            'keyName': 'Authorization',
            'where': 'header',
          },{
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      validateStatus: validateStatus,
    );

    final _queryParameters = <String, dynamic>{
      if (month != null) r'month': encodeQueryParameter(_serializers, month, const FullType(String)),
      if (from != null) r'from': encodeQueryParameter(_serializers, from, const FullType(String)),
      if (to != null) r'to': encodeQueryParameter(_serializers, to, const FullType(String)),
    };

    final _response = await _dio.request<Object>(
      _path,
      options: _options,
      queryParameters: _queryParameters,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    GroupOverview? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(GroupOverview),
      ) as GroupOverview;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<GroupOverview>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

  /// List the products behind a Dashboard tile
  /// This will list the product lines that make up the Unhealthy or Unplanned figure for a period, newest receipt first, over the receipts the caller can see [group.receipts.read]
  ///
  /// Parameters:
  /// * [groupId] - Id of the group; the All group spans every group the caller can read
  /// * [kind] - UNHEALTHY, UNPLANNED or FOODGROUP (the products of one food group)
  /// * [foodGroup] - With kind FOODGROUP, the food group's name as the Dashboard shows it; empty for Uncategorized
  /// * [month] - Month, yyyy-MM. Defaults to the current month in the app time zone.
  /// * [from] - First day, yyyy-MM-dd. With to, replaces month.
  /// * [to] - Last day, yyyy-MM-dd
  /// * [cancelToken] - A [CancelToken] that can be used to cancel the operation
  /// * [headers] - Can be used to add additional headers to the request
  /// * [extras] - Can be used to add flags to the request
  /// * [validateStatus] - A [ValidateStatus] callback that can be used to determine request success based on the HTTP status of the response
  /// * [onSendProgress] - A [ProgressCallback] that can be used to get the send progress
  /// * [onReceiveProgress] - A [ProgressCallback] that can be used to get the receive progress
  ///
  /// Returns a [Future] containing a [Response] with a [BuiltList<GroupOverviewProduct>] as data
  /// Throws [DioException] if API call or serialization fails
  Future<Response<BuiltList<GroupOverviewProduct>>> getOverviewProducts({ 
    required int groupId,
    required String kind,
    String? foodGroup,
    String? month,
    String? from,
    String? to,
    CancelToken? cancelToken,
    Map<String, dynamic>? headers,
    Map<String, dynamic>? extra,
    ValidateStatus? validateStatus,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final _path = r'/overview/group/{groupId}/products'.replaceAll('{' r'groupId' '}', encodeQueryParameter(_serializers, groupId, const FullType(int)).toString());
    final _options = Options(
      method: r'GET',
      headers: <String, dynamic>{
        ...?headers,
      },
      extra: <String, dynamic>{
        'secure': <Map<String, String>>[
          {
            'type': 'apiKey',
            'name': 'apiKeyAuth',
            'keyName': 'Authorization',
            'where': 'header',
          },{
            'type': 'http',
            'scheme': 'bearer',
            'name': 'bearerAuth',
          },
        ],
        ...?extra,
      },
      validateStatus: validateStatus,
    );

    final _queryParameters = <String, dynamic>{
      r'kind': encodeQueryParameter(_serializers, kind, const FullType(String)),
      if (foodGroup != null) r'foodGroup': encodeQueryParameter(_serializers, foodGroup, const FullType(String)),
      if (month != null) r'month': encodeQueryParameter(_serializers, month, const FullType(String)),
      if (from != null) r'from': encodeQueryParameter(_serializers, from, const FullType(String)),
      if (to != null) r'to': encodeQueryParameter(_serializers, to, const FullType(String)),
    };

    final _response = await _dio.request<Object>(
      _path,
      options: _options,
      queryParameters: _queryParameters,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
      onReceiveProgress: onReceiveProgress,
    );

    BuiltList<GroupOverviewProduct>? _responseData;

    try {
      final rawResponse = _response.data;
      _responseData = rawResponse == null ? null : _serializers.deserialize(
        rawResponse,
        specifiedType: const FullType(BuiltList, [FullType(GroupOverviewProduct)]),
      ) as BuiltList<GroupOverviewProduct>;

    } catch (error, stackTrace) {
      throw DioException(
        requestOptions: _response.requestOptions,
        response: _response,
        type: DioExceptionType.unknown,
        error: error,
        stackTrace: stackTrace,
      );
    }

    return Response<BuiltList<GroupOverviewProduct>>(
      data: _responseData,
      headers: _response.headers,
      isRedirect: _response.isRedirect,
      requestOptions: _response.requestOptions,
      redirects: _response.redirects,
      statusCode: _response.statusCode,
      statusMessage: _response.statusMessage,
      extra: _response.extra,
    );
  }

}
