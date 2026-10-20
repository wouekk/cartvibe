//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'shopping_trip.g.dart';

/// A receipt attached to a shopping list, or a photo waiting to become one.
///
/// Properties:
/// * [id] 
/// * [createdAt] 
/// * [updatedAt] 
/// * [createdBy] 
/// * [createdByString] 
/// * [shoppingListId] 
/// * [receiptId] - Null while an uploaded photo waits to become a receipt
/// * [status] - PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client.
/// * [lastError] - Why the last step did not succeed; empty otherwise
@BuiltValue()
abstract class ShoppingTrip implements Built<ShoppingTrip, ShoppingTripBuilder> {
  @BuiltValueField(wireName: r'id')
  int get id;

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  @BuiltValueField(wireName: r'createdBy')
  int? get createdBy;

  @BuiltValueField(wireName: r'createdByString')
  String? get createdByString;

  @BuiltValueField(wireName: r'shoppingListId')
  int get shoppingListId;

  /// Null while an uploaded photo waits to become a receipt
  @BuiltValueField(wireName: r'receiptId')
  int? get receiptId;

  /// PENDING, RUNNING, DONE, UNAVAILABLE (the AI could not be reached; retried automatically) or FAILED. A plain string, never an enum, so a new state cannot break an older client.
  @BuiltValueField(wireName: r'status')
  String get status;

  /// Why the last step did not succeed; empty otherwise
  @BuiltValueField(wireName: r'lastError')
  String get lastError;

  ShoppingTrip._();

  factory ShoppingTrip([void updates(ShoppingTripBuilder b)]) = _$ShoppingTrip;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ShoppingTripBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ShoppingTrip> get serializer => _$ShoppingTripSerializer();
}

class _$ShoppingTripSerializer implements PrimitiveSerializer<ShoppingTrip> {
  @override
  final Iterable<Type> types = const [ShoppingTrip, _$ShoppingTrip];

  @override
  final String wireName = r'ShoppingTrip';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ShoppingTrip object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(int),
    );
    if (object.createdAt != null) {
      yield r'createdAt';
      yield serializers.serialize(
        object.createdAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.createdBy != null) {
      yield r'createdBy';
      yield serializers.serialize(
        object.createdBy,
        specifiedType: const FullType(int),
      );
    }
    if (object.createdByString != null) {
      yield r'createdByString';
      yield serializers.serialize(
        object.createdByString,
        specifiedType: const FullType(String),
      );
    }
    yield r'shoppingListId';
    yield serializers.serialize(
      object.shoppingListId,
      specifiedType: const FullType(int),
    );
    if (object.receiptId != null) {
      yield r'receiptId';
      yield serializers.serialize(
        object.receiptId,
        specifiedType: const FullType(int),
      );
    }
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
  }

  @override
  Object serialize(
    Serializers serializers,
    ShoppingTrip object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ShoppingTripBuilder result,
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
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        case r'createdBy':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.createdBy = valueDes;
          break;
        case r'createdByString':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.createdByString = valueDes;
          break;
        case r'shoppingListId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.shoppingListId = valueDes;
          break;
        case r'receiptId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.receiptId = valueDes;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ShoppingTrip deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ShoppingTripBuilder();
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

