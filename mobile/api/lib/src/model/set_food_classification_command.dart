//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'set_food_classification_command.g.dart';

/// SetFoodClassificationCommand
///
/// Properties:
/// * [health] - HEALTHY, MEDIUM, UNHEALTHY or NOT_FOOD
/// * [seasonality] - SEASONAL, OUT_OF_SEASON or NOT_PRODUCE; empty leaves it as it was
@BuiltValue()
abstract class SetFoodClassificationCommand implements Built<SetFoodClassificationCommand, SetFoodClassificationCommandBuilder> {
  /// HEALTHY, MEDIUM, UNHEALTHY or NOT_FOOD
  @BuiltValueField(wireName: r'health')
  String get health;

  /// SEASONAL, OUT_OF_SEASON or NOT_PRODUCE; empty leaves it as it was
  @BuiltValueField(wireName: r'seasonality')
  String? get seasonality;

  SetFoodClassificationCommand._();

  factory SetFoodClassificationCommand([void updates(SetFoodClassificationCommandBuilder b)]) = _$SetFoodClassificationCommand;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SetFoodClassificationCommandBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SetFoodClassificationCommand> get serializer => _$SetFoodClassificationCommandSerializer();
}

class _$SetFoodClassificationCommandSerializer implements PrimitiveSerializer<SetFoodClassificationCommand> {
  @override
  final Iterable<Type> types = const [SetFoodClassificationCommand, _$SetFoodClassificationCommand];

  @override
  final String wireName = r'SetFoodClassificationCommand';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SetFoodClassificationCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'health';
    yield serializers.serialize(
      object.health,
      specifiedType: const FullType(String),
    );
    if (object.seasonality != null) {
      yield r'seasonality';
      yield serializers.serialize(
        object.seasonality,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    SetFoodClassificationCommand object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SetFoodClassificationCommandBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'health':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.health = valueDes;
          break;
        case r'seasonality':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.seasonality = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SetFoodClassificationCommand deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SetFoodClassificationCommandBuilder();
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

