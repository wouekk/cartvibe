//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:openapi/src/model/exchange_rate.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'exchange_rates.g.dart';

/// The household's rate table. A rate is how many units of the main currency one unit of the currency is worth, typed in by hand.
///
/// Properties:
/// * [mainCurrency] - ISO code of the main currency; empty for a custom currency symbol, which disables conversion
/// * [rates] 
@BuiltValue()
abstract class ExchangeRates implements Built<ExchangeRates, ExchangeRatesBuilder> {
  /// ISO code of the main currency; empty for a custom currency symbol, which disables conversion
  @BuiltValueField(wireName: r'mainCurrency')
  String? get mainCurrency;

  @BuiltValueField(wireName: r'rates')
  BuiltList<ExchangeRate> get rates;

  ExchangeRates._();

  factory ExchangeRates([void updates(ExchangeRatesBuilder b)]) = _$ExchangeRates;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ExchangeRatesBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ExchangeRates> get serializer => _$ExchangeRatesSerializer();
}

class _$ExchangeRatesSerializer implements PrimitiveSerializer<ExchangeRates> {
  @override
  final Iterable<Type> types = const [ExchangeRates, _$ExchangeRates];

  @override
  final String wireName = r'ExchangeRates';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ExchangeRates object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.mainCurrency != null) {
      yield r'mainCurrency';
      yield serializers.serialize(
        object.mainCurrency,
        specifiedType: const FullType(String),
      );
    }
    yield r'rates';
    yield serializers.serialize(
      object.rates,
      specifiedType: const FullType(BuiltList, [FullType(ExchangeRate)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ExchangeRates object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ExchangeRatesBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'mainCurrency':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.mainCurrency = valueDes;
          break;
        case r'rates':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(ExchangeRate)]),
          ) as BuiltList<ExchangeRate>;
          result.rates.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ExchangeRates deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ExchangeRatesBuilder();
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

