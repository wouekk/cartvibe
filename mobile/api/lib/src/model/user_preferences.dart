//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:openapi/src/model/base_model.dart';
import 'package:openapi/src/model/receipt_status.dart';
import 'package:built_collection/built_collection.dart';
import 'package:openapi/src/model/user_shortcut.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'user_preferences.g.dart';

/// UserPreferences
///
/// Properties:
/// * [id] - User preferences id
/// * [createdAt] 
/// * [createdBy] 
/// * [createdByString] - Created by entity's name
/// * [updatedAt] 
/// * [userId] - User foreign key
/// * [quickScanDefaultGroupId] - Group foreign key
/// * [quickScanDefaultPaidById] - User foreign key
/// * [quickScanDefaultStatus] - Default quick scan status
/// * [closeChipSelectOnSelect] - Whether multi-select chip fields close their option list after each selection
/// * [monthlySpendingGoal] - The most this person wants to spend in a month, as a decimal string; null or 0 means no goal
/// * [displayCurrency] - The ISO code of the currency this person sees the Dashboard in; empty means the household currency
/// * [displayCurrencyRate] - How many units of displayCurrency one unit of the household currency is worth, as a decimal string; only the Dashboard converts
/// * [userShortcuts] 
@BuiltValue()
abstract class UserPreferences implements BaseModel, Built<UserPreferences, UserPreferencesBuilder> {
  /// Default quick scan status
  @BuiltValueField(wireName: r'quickScanDefaultStatus')
  ReceiptStatus? get quickScanDefaultStatus;
  // enum quickScanDefaultStatusEnum {  OPEN,  NEEDS_ATTENTION,  RESOLVED,  DRAFT,  DECLINED,  ,  };

  /// How many units of displayCurrency one unit of the household currency is worth, as a decimal string; only the Dashboard converts
  @BuiltValueField(wireName: r'displayCurrencyRate')
  String? get displayCurrencyRate;

  /// The most this person wants to spend in a month, as a decimal string; null or 0 means no goal
  @BuiltValueField(wireName: r'monthlySpendingGoal')
  String? get monthlySpendingGoal;

  @BuiltValueField(wireName: r'userShortcuts')
  BuiltList<UserShortcut>? get userShortcuts;

  /// Whether multi-select chip fields close their option list after each selection
  @BuiltValueField(wireName: r'closeChipSelectOnSelect')
  bool? get closeChipSelectOnSelect;

  /// The ISO code of the currency this person sees the Dashboard in; empty means the household currency
  @BuiltValueField(wireName: r'displayCurrency')
  String? get displayCurrency;

  /// User foreign key
  @BuiltValueField(wireName: r'userId')
  int get userId;

  /// Group foreign key
  @BuiltValueField(wireName: r'quickScanDefaultGroupId')
  int? get quickScanDefaultGroupId;

  /// User foreign key
  @BuiltValueField(wireName: r'quickScanDefaultPaidById')
  int? get quickScanDefaultPaidById;

  UserPreferences._();

  factory UserPreferences([void updates(UserPreferencesBuilder b)]) = _$UserPreferences;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UserPreferencesBuilder b) => b
      ..closeChipSelectOnSelect = false
      ..quickScanDefaultGroupId = 0
      ..quickScanDefaultStatus = ReceiptStatus.OPEN
      ..createdBy = 0
      ..displayCurrency = ''
      ..quickScanDefaultPaidById = 0
      ..createdByString = ''
      ..updatedAt = '';

  @BuiltValueSerializer(custom: true)
  static Serializer<UserPreferences> get serializer => _$UserPreferencesSerializer();
}

class _$UserPreferencesSerializer implements PrimitiveSerializer<UserPreferences> {
  @override
  final Iterable<Type> types = const [UserPreferences, _$UserPreferences];

  @override
  final String wireName = r'UserPreferences';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UserPreferences object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.closeChipSelectOnSelect != null) {
      yield r'closeChipSelectOnSelect';
      yield serializers.serialize(
        object.closeChipSelectOnSelect,
        specifiedType: const FullType(bool),
      );
    }
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(int),
    );
    if (object.quickScanDefaultGroupId != null) {
      yield r'quickScanDefaultGroupId';
      yield serializers.serialize(
        object.quickScanDefaultGroupId,
        specifiedType: const FullType(int),
      );
    }
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(String),
    );
    if (object.quickScanDefaultStatus != null) {
      yield r'quickScanDefaultStatus';
      yield serializers.serialize(
        object.quickScanDefaultStatus,
        specifiedType: const FullType(ReceiptStatus),
      );
    }
    if (object.displayCurrencyRate != null) {
      yield r'displayCurrencyRate';
      yield serializers.serialize(
        object.displayCurrencyRate,
        specifiedType: const FullType(String),
      );
    }
    if (object.createdBy != null) {
      yield r'createdBy';
      yield serializers.serialize(
        object.createdBy,
        specifiedType: const FullType(int),
      );
    }
    if (object.monthlySpendingGoal != null) {
      yield r'monthlySpendingGoal';
      yield serializers.serialize(
        object.monthlySpendingGoal,
        specifiedType: const FullType(String),
      );
    }
    if (object.userShortcuts != null) {
      yield r'userShortcuts';
      yield serializers.serialize(
        object.userShortcuts,
        specifiedType: const FullType(BuiltList, [FullType(UserShortcut)]),
      );
    }
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(int),
    );
    if (object.displayCurrency != null) {
      yield r'displayCurrency';
      yield serializers.serialize(
        object.displayCurrency,
        specifiedType: const FullType(String),
      );
    }
    if (object.quickScanDefaultPaidById != null) {
      yield r'quickScanDefaultPaidById';
      yield serializers.serialize(
        object.quickScanDefaultPaidById,
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
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    UserPreferences object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UserPreferencesBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'closeChipSelectOnSelect':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.closeChipSelectOnSelect = valueDes;
          break;
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.userId = valueDes;
          break;
        case r'quickScanDefaultGroupId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.quickScanDefaultGroupId = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.createdAt = valueDes;
          break;
        case r'quickScanDefaultStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReceiptStatus),
          ) as ReceiptStatus;
          result.quickScanDefaultStatus = valueDes;
          break;
        case r'displayCurrencyRate':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayCurrencyRate = valueDes;
          break;
        case r'createdBy':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.createdBy = valueDes;
          break;
        case r'monthlySpendingGoal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.monthlySpendingGoal = valueDes;
          break;
        case r'userShortcuts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(UserShortcut)]),
          ) as BuiltList<UserShortcut>;
          result.userShortcuts.replace(valueDes);
          break;
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.id = valueDes;
          break;
        case r'displayCurrency':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayCurrency = valueDes;
          break;
        case r'quickScanDefaultPaidById':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.quickScanDefaultPaidById = valueDes;
          break;
        case r'createdByString':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.createdByString = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.updatedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UserPreferences deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UserPreferencesBuilder();
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

