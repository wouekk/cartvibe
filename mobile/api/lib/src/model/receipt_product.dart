//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'receipt_product.g.dart';

/// ReceiptProduct
///
/// Properties:
/// * [id] 
/// * [createdAt] 
/// * [updatedAt] 
/// * [createdBy] 
/// * [receiptId] 
/// * [name] - The product line as printed on the receipt
/// * [displayName] - A short plain name for the product; empty when the AI gave none
/// * [amount] - What the line cost, as a decimal string; null when the receipt shows no price
/// * [quantity] - Quantity or weight as printed; empty when not printed
/// * [position] - The line's order on the receipt
/// * [health] - HEALTHY, MEDIUM, UNHEALTHY, NOT_FOOD, UNKNOWN, or empty while not yet classified. A plain string, never an enum, so a new rating cannot break an older client.
/// * [foodGroup] - A short lowercase food group, e.g. \"fresh produce\"; empty while not yet classified
/// * [seasonality] - For fresh fruit and vegetables, SEASONAL or OUT_OF_SEASON in Western Europe in the month bought; NOT_PRODUCE otherwise; empty while not yet classified. A plain string.
/// * [classifiedAt] - When the tags were set; null while waiting to be classified
/// * [classificationOverridden] - The tags were corrected by a person
@BuiltValue()
abstract class ReceiptProduct implements Built<ReceiptProduct, ReceiptProductBuilder> {
  @BuiltValueField(wireName: r'id')
  int get id;

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  @BuiltValueField(wireName: r'createdBy')
  int? get createdBy;

  @BuiltValueField(wireName: r'receiptId')
  int get receiptId;

  /// The product line as printed on the receipt
  @BuiltValueField(wireName: r'name')
  String get name;

  /// A short plain name for the product; empty when the AI gave none
  @BuiltValueField(wireName: r'displayName')
  String get displayName;

  /// What the line cost, as a decimal string; null when the receipt shows no price
  @BuiltValueField(wireName: r'amount')
  String? get amount;

  /// Quantity or weight as printed; empty when not printed
  @BuiltValueField(wireName: r'quantity')
  String get quantity;

  /// The line's order on the receipt
  @BuiltValueField(wireName: r'position')
  int get position;

  /// HEALTHY, MEDIUM, UNHEALTHY, NOT_FOOD, UNKNOWN, or empty while not yet classified. A plain string, never an enum, so a new rating cannot break an older client.
  @BuiltValueField(wireName: r'health')
  String get health;

  /// A short lowercase food group, e.g. \"fresh produce\"; empty while not yet classified
  @BuiltValueField(wireName: r'foodGroup')
  String get foodGroup;

  /// For fresh fruit and vegetables, SEASONAL or OUT_OF_SEASON in Western Europe in the month bought; NOT_PRODUCE otherwise; empty while not yet classified. A plain string.
  @BuiltValueField(wireName: r'seasonality')
  String get seasonality;

  /// When the tags were set; null while waiting to be classified
  @BuiltValueField(wireName: r'classifiedAt')
  DateTime? get classifiedAt;

  /// The tags were corrected by a person
  @BuiltValueField(wireName: r'classificationOverridden')
  bool get classificationOverridden;

  ReceiptProduct._();

  factory ReceiptProduct([void updates(ReceiptProductBuilder b)]) = _$ReceiptProduct;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReceiptProductBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReceiptProduct> get serializer => _$ReceiptProductSerializer();
}

class _$ReceiptProductSerializer implements PrimitiveSerializer<ReceiptProduct> {
  @override
  final Iterable<Type> types = const [ReceiptProduct, _$ReceiptProduct];

  @override
  final String wireName = r'ReceiptProduct';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReceiptProduct object, {
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
    yield r'receiptId';
    yield serializers.serialize(
      object.receiptId,
      specifiedType: const FullType(int),
    );
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'displayName';
    yield serializers.serialize(
      object.displayName,
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
    yield r'position';
    yield serializers.serialize(
      object.position,
      specifiedType: const FullType(int),
    );
    yield r'health';
    yield serializers.serialize(
      object.health,
      specifiedType: const FullType(String),
    );
    yield r'foodGroup';
    yield serializers.serialize(
      object.foodGroup,
      specifiedType: const FullType(String),
    );
    yield r'seasonality';
    yield serializers.serialize(
      object.seasonality,
      specifiedType: const FullType(String),
    );
    if (object.classifiedAt != null) {
      yield r'classifiedAt';
      yield serializers.serialize(
        object.classifiedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    yield r'classificationOverridden';
    yield serializers.serialize(
      object.classificationOverridden,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReceiptProduct object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReceiptProductBuilder result,
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
        case r'receiptId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.receiptId = valueDes;
          break;
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
          break;
        case r'displayName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayName = valueDes;
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
        case r'position':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.position = valueDes;
          break;
        case r'health':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.health = valueDes;
          break;
        case r'foodGroup':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.foodGroup = valueDes;
          break;
        case r'seasonality':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.seasonality = valueDes;
          break;
        case r'classifiedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.classifiedAt = valueDes;
          break;
        case r'classificationOverridden':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.classificationOverridden = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReceiptProduct deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReceiptProductBuilder();
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

