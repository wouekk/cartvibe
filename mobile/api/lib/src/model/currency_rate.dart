//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'currency_rate.g.dart';

/// CurrencyRate
///
/// Properties:
/// * [code] - Three-letter ISO code, e.g. CHF
/// * [rate] - Main currency per one unit of code, as a decimal string; null until entered
@BuiltValue()
abstract class CurrencyRate implements Built<CurrencyRate, CurrencyRateBuilder> {
  /// Three-letter ISO code, e.g. CHF
  @BuiltValueField(wireName: r'code')
  String get code;

  /// Main currency per one unit of code, as a decimal string; null until entered
  @BuiltValueField(wireName: r'rate')
  String? get rate;

  CurrencyRate._();

  factory CurrencyRate([void updates(CurrencyRateBuilder b)]) = _$CurrencyRate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CurrencyRateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CurrencyRate> get serializer => _$CurrencyRateSerializer();
}

class _$CurrencyRateSerializer implements PrimitiveSerializer<CurrencyRate> {
  @override
  final Iterable<Type> types = const [CurrencyRate, _$CurrencyRate];

  @override
  final String wireName = r'CurrencyRate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CurrencyRate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'code';
    yield serializers.serialize(
      object.code,
      specifiedType: const FullType(String),
    );
    if (object.rate != null) {
      yield r'rate';
      yield serializers.serialize(
        object.rate,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CurrencyRate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CurrencyRateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'code':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.code = valueDes;
          break;
        case r'rate':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rate = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CurrencyRate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CurrencyRateBuilder();
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

