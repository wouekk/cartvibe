//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'group_overview_product.g.dart';

/// A product line behind a Dashboard tile, with the receipt it is on
///
/// Properties:
/// * [id] 
/// * [receiptId] 
/// * [receiptName] 
/// * [receiptDate] - yyyy-MM-dd
/// * [name] 
/// * [amount] 
/// * [quantity] 
/// * [health] 
/// * [planned] 
@BuiltValue()
abstract class GroupOverviewProduct implements Built<GroupOverviewProduct, GroupOverviewProductBuilder> {
  @BuiltValueField(wireName: r'id')
  int get id;

  @BuiltValueField(wireName: r'receiptId')
  int get receiptId;

  @BuiltValueField(wireName: r'receiptName')
  String get receiptName;

  /// yyyy-MM-dd
  @BuiltValueField(wireName: r'receiptDate')
  String get receiptDate;

  @BuiltValueField(wireName: r'name')
  String get name;

  @BuiltValueField(wireName: r'amount')
  String? get amount;

  @BuiltValueField(wireName: r'quantity')
  String get quantity;

  @BuiltValueField(wireName: r'health')
  String get health;

  @BuiltValueField(wireName: r'planned')
  bool? get planned;

  GroupOverviewProduct._();

  factory GroupOverviewProduct([void updates(GroupOverviewProductBuilder b)]) = _$GroupOverviewProduct;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GroupOverviewProductBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GroupOverviewProduct> get serializer => _$GroupOverviewProductSerializer();
}

class _$GroupOverviewProductSerializer implements PrimitiveSerializer<GroupOverviewProduct> {
  @override
  final Iterable<Type> types = const [GroupOverviewProduct, _$GroupOverviewProduct];

  @override
  final String wireName = r'GroupOverviewProduct';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GroupOverviewProduct object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(int),
    );
    yield r'receiptId';
    yield serializers.serialize(
      object.receiptId,
      specifiedType: const FullType(int),
    );
    yield r'receiptName';
    yield serializers.serialize(
      object.receiptName,
      specifiedType: const FullType(String),
    );
    yield r'receiptDate';
    yield serializers.serialize(
      object.receiptDate,
      specifiedType: const FullType(String),
    );
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
    yield r'quantity';
    yield serializers.serialize(
      object.quantity,
      specifiedType: const FullType(String),
    );
    yield r'health';
    yield serializers.serialize(
      object.health,
      specifiedType: const FullType(String),
    );
    if (object.planned != null) {
      yield r'planned';
      yield serializers.serialize(
        object.planned,
        specifiedType: const FullType(bool),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    GroupOverviewProduct object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GroupOverviewProductBuilder result,
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
        case r'receiptId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.receiptId = valueDes;
          break;
        case r'receiptName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.receiptName = valueDes;
          break;
        case r'receiptDate':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.receiptDate = valueDes;
          break;
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
        case r'quantity':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.quantity = valueDes;
          break;
        case r'health':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.health = valueDes;
          break;
        case r'planned':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.planned = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  GroupOverviewProduct deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GroupOverviewProductBuilder();
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

