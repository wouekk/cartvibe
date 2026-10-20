//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'exchange_rate.g.dart';

/// ExchangeRate
///
/// Properties:
/// * [code] - Three-letter ISO code, e.g. CHF
/// * [rate] - Main currency per one unit of code, as a decimal string; null until entered
@BuiltValue()
abstract class ExchangeRate implements Built<ExchangeRate, ExchangeRateBuilder> {
  /// Three-letter ISO code, e.g. CHF
  @BuiltValueField(wireName: r'code')
  String get code;

  /// Main currency per one unit of code, as a decimal string; null until entered
  @BuiltValueField(wireName: r'rate')
  String? get rate;

  ExchangeRate._();

  factory ExchangeRate([void updates(ExchangeRateBuilder b)]) = _$ExchangeRate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ExchangeRateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ExchangeRate> get serializer => _$ExchangeRateSerializer();
}

class _$ExchangeRateSerializer implements PrimitiveSerializer<ExchangeRate> {
  @override
  final Iterable<Type> types = const [ExchangeRate, _$ExchangeRate];

  @override
  final String wireName = r'ExchangeRate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ExchangeRate object, {
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
    ExchangeRate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ExchangeRateBuilder result,
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
  ExchangeRate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ExchangeRateBuilder();
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

