//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:openapi/src/model/shopping_trip_receipt.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'shopping_trip_view.g.dart';

/// A shopping trip as a list shows it. receipt is null while the photo waits, and for a receipt the caller may not see.
///
/// Properties:
/// * [id] 
/// * [shoppingListId] 
/// * [createdAt] 
/// * [status] - The trip's status (see ShoppingTrip.status); a plain string
/// * [lastError] 
/// * [waitingForPhoto] - True while an uploaded photo has not become a receipt yet
/// * [receipt] 
/// * [plannedItemCount] - How many list items counted as planned
/// * [productCount] - How many products the receipt has; 0 until the trip is DONE
/// * [unplannedAmount] - What the products not on the list cost, as a decimal string. Null until the trip is DONE, and for a receipt the caller may not see.
/// * [unplannedProducts] - Names of the products that were not on the list. Always an array.
@BuiltValue()
abstract class ShoppingTripView implements Built<ShoppingTripView, ShoppingTripViewBuilder> {
  @BuiltValueField(wireName: r'id')
  int get id;

  @BuiltValueField(wireName: r'shoppingListId')
  int get shoppingListId;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  /// The trip's status (see ShoppingTrip.status); a plain string
  @BuiltValueField(wireName: r'status')
  String get status;

  @BuiltValueField(wireName: r'lastError')
  String get lastError;

  /// True while an uploaded photo has not become a receipt yet
  @BuiltValueField(wireName: r'waitingForPhoto')
  bool get waitingForPhoto;

  @BuiltValueField(wireName: r'receipt')
  ShoppingTripReceipt? get receipt;

  /// How many list items counted as planned
  @BuiltValueField(wireName: r'plannedItemCount')
  int get plannedItemCount;

  /// How many products the receipt has; 0 until the trip is DONE
  @BuiltValueField(wireName: r'productCount')
  int get productCount;

  /// What the products not on the list cost, as a decimal string. Null until the trip is DONE, and for a receipt the caller may not see.
  @BuiltValueField(wireName: r'unplannedAmount')
  String? get unplannedAmount;

  /// Names of the products that were not on the list. Always an array.
  @BuiltValueField(wireName: r'unplannedProducts')
  BuiltList<String> get unplannedProducts;

  ShoppingTripView._();

  factory ShoppingTripView([void updates(ShoppingTripViewBuilder b)]) = _$ShoppingTripView;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ShoppingTripViewBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ShoppingTripView> get serializer => _$ShoppingTripViewSerializer();
}

class _$ShoppingTripViewSerializer implements PrimitiveSerializer<ShoppingTripView> {
  @override
  final Iterable<Type> types = const [ShoppingTripView, _$ShoppingTripView];

  @override
  final String wireName = r'ShoppingTripView';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ShoppingTripView object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(int),
    );
    yield r'shoppingListId';
    yield serializers.serialize(
      object.shoppingListId,
      specifiedType: const FullType(int),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
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
    yield r'waitingForPhoto';
    yield serializers.serialize(
      object.waitingForPhoto,
      specifiedType: const FullType(bool),
    );
    if (object.receipt != null) {
      yield r'receipt';
      yield serializers.serialize(
        object.receipt,
        specifiedType: const FullType(ShoppingTripReceipt),
      );
    }
    yield r'plannedItemCount';
    yield serializers.serialize(
      object.plannedItemCount,
      specifiedType: const FullType(int),
    );
    yield r'productCount';
    yield serializers.serialize(
      object.productCount,
      specifiedType: const FullType(int),
    );
    if (object.unplannedAmount != null) {
      yield r'unplannedAmount';
      yield serializers.serialize(
        object.unplannedAmount,
        specifiedType: const FullType(String),
      );
    }
    yield r'unplannedProducts';
    yield serializers.serialize(
      object.unplannedProducts,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ShoppingTripView object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ShoppingTripViewBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.id = valueDes;
          break;
        case r'shoppingListId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.shoppingListId = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
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
        case r'waitingForPhoto':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.waitingForPhoto = valueDes;
          break;
        case r'receipt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ShoppingTripReceipt),
          ) as ShoppingTripReceipt;
          result.receipt.replace(valueDes);
          break;
        case r'plannedItemCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.plannedItemCount = valueDes;
          break;
        case r'productCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.productCount = valueDes;
          break;
        case r'unplannedAmount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.unplannedAmount = valueDes;
          break;
        case r'unplannedProducts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.unplannedProducts.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ShoppingTripView deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ShoppingTripViewBuilder();
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

