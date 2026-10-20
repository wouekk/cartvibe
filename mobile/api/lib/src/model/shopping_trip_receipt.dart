//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'shopping_trip_receipt.g.dart';

/// ShoppingTripReceipt
///
/// Properties:
/// * [id] 
/// * [name] 
/// * [date] 
/// * [amount] - The receipt's total, as a decimal string
@BuiltValue()
abstract class ShoppingTripReceipt implements Built<ShoppingTripReceipt, ShoppingTripReceiptBuilder> {
  @BuiltValueField(wireName: r'id')
  int get id;

  @BuiltValueField(wireName: r'name')
  String get name;

  @BuiltValueField(wireName: r'date')
  DateTime get date;

  /// The receipt's total, as a decimal string
  @BuiltValueField(wireName: r'amount')
  String get amount;

  ShoppingTripReceipt._();

  factory ShoppingTripReceipt([void updates(ShoppingTripReceiptBuilder b)]) = _$ShoppingTripReceipt;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ShoppingTripReceiptBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ShoppingTripReceipt> get serializer => _$ShoppingTripReceiptSerializer();
}

class _$ShoppingTripReceiptSerializer implements PrimitiveSerializer<ShoppingTripReceipt> {
  @override
  final Iterable<Type> types = const [ShoppingTripReceipt, _$ShoppingTripReceipt];

  @override
  final String wireName = r'ShoppingTripReceipt';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ShoppingTripReceipt object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(int),
    );
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'date';
    yield serializers.serialize(
      object.date,
      specifiedType: const FullType(DateTime),
    );
    yield r'amount';
    yield serializers.serialize(
      object.amount,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ShoppingTripReceipt object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ShoppingTripReceiptBuilder result,
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
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
          break;
        case r'date':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.date = valueDes;
          break;
        case r'amount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.amount = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ShoppingTripReceipt deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ShoppingTripReceiptBuilder();
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

