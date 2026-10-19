//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:openapi/src/model/receipt_product.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'receipt_products_view.g.dart';

/// ReceiptProductsView
///
/// Properties:
/// * [status] - NOT_QUEUED, PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client.
/// * [lastError] - Why the last read did not succeed; empty otherwise
/// * [products] - The products in receipt order. Always an array.
@BuiltValue()
abstract class ReceiptProductsView implements Built<ReceiptProductsView, ReceiptProductsViewBuilder> {
  /// NOT_QUEUED, PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client.
  @BuiltValueField(wireName: r'status')
  String get status;

  /// Why the last read did not succeed; empty otherwise
  @BuiltValueField(wireName: r'lastError')
  String get lastError;

  /// The products in receipt order. Always an array.
  @BuiltValueField(wireName: r'products')
  BuiltList<ReceiptProduct> get products;

  ReceiptProductsView._();

  factory ReceiptProductsView([void updates(ReceiptProductsViewBuilder b)]) = _$ReceiptProductsView;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReceiptProductsViewBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReceiptProductsView> get serializer => _$ReceiptProductsViewSerializer();
}

class _$ReceiptProductsViewSerializer implements PrimitiveSerializer<ReceiptProductsView> {
  @override
  final Iterable<Type> types = const [ReceiptProductsView, _$ReceiptProductsView];

  @override
  final String wireName = r'ReceiptProductsView';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReceiptProductsView object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(String),
    );
    yield r'lastError';
    yield serializers.serialize(
      object.lastError,
      specifiedType: const FullType(String),
    );
    yield r'products';
    yield serializers.serialize(
      object.products,
      specifiedType: const FullType(BuiltList, [FullType(ReceiptProduct)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReceiptProductsView object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReceiptProductsViewBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.status = valueDes;
          break;
        case r'lastError':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.lastError = valueDes;
          break;
        case r'products':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(ReceiptProduct)]),
          ) as BuiltList<ReceiptProduct>;
          result.products.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReceiptProductsView deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReceiptProductsViewBuilder();
    final serializedList = (serialized as Iterable<Object?>).toList();
    final unhandled = <Object?>[];
    _deserializeProperties(
      serializers,
      serialized,
      specifiedType: specifiedType,
      serializedList: serializedList,
      unhandled: unhandled,
      result: result,
    );
    return result.build();
  }
}

