//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'receipt_search_match.g.dart';

/// ReceiptSearchMatch
///
/// Properties:
/// * [name] - The product line's plain name
/// * [amount] - What the line cost, when the receipt shows it
@BuiltValue()
abstract class ReceiptSearchMatch implements Built<ReceiptSearchMatch, ReceiptSearchMatchBuilder> {
  /// The product line's plain name
  @BuiltValueField(wireName: r'name')
  String get name;

  /// What the line cost, when the receipt shows it
  @BuiltValueField(wireName: r'amount')
  String? get amount;

  ReceiptSearchMatch._();

  factory ReceiptSearchMatch([void updates(ReceiptSearchMatchBuilder b)]) = _$ReceiptSearchMatch;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReceiptSearchMatchBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReceiptSearchMatch> get serializer => _$ReceiptSearchMatchSerializer();
}

class _$ReceiptSearchMatchSerializer implements PrimitiveSerializer<ReceiptSearchMatch> {
  @override
  final Iterable<Type> types = const [ReceiptSearchMatch, _$ReceiptSearchMatch];

  @override
  final String wireName = r'ReceiptSearchMatch';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReceiptSearchMatch object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    if (object.amount != null) {
      yield r'amount';
      yield serializers.serialize(
        object.amount,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ReceiptSearchMatch object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReceiptSearchMatchBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
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
  ReceiptSearchMatch deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReceiptSearchMatchBuilder();
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

