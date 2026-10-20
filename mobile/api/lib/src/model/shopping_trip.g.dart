// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shopping_trip.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ShoppingTrip extends ShoppingTrip {
  @override
  final int id;
  @override
  final DateTime? createdAt;
  @override
  final DateTime? updatedAt;
  @override
  final int? createdBy;
  @override
  final String? createdByString;
  @override
  final int shoppingListId;
  @override
  final int? receiptId;
  @override
  final String status;
  @override
  final String lastError;

  factory _$ShoppingTrip([void Function(ShoppingTripBuilder)? updates]) =>
      (ShoppingTripBuilder()..update(updates))._build();

  _$ShoppingTrip._(
      {required this.id,
      this.createdAt,
      this.updatedAt,
      this.createdBy,
      this.createdByString,
      required this.shoppingListId,
      this.receiptId,
      required this.status,
      required this.lastError})
      : super._();
  @override
  ShoppingTrip rebuild(void Function(ShoppingTripBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ShoppingTripBuilder toBuilder() => ShoppingTripBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ShoppingTrip &&
        id == other.id &&
        createdAt == other.createdAt &&
        updatedAt == other.updatedAt &&
        createdBy == other.createdBy &&
        createdByString == other.createdByString &&
        shoppingListId == other.shoppingListId &&
        receiptId == other.receiptId &&
        status == other.status &&
        lastError == other.lastError;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, id.hashCode);
    _$hash = $jc(_$hash, createdAt.hashCode);
    _$hash = $jc(_$hash, updatedAt.hashCode);
    _$hash = $jc(_$hash, createdBy.hashCode);
    _$hash = $jc(_$hash, createdByString.hashCode);
    _$hash = $jc(_$hash, shoppingListId.hashCode);
    _$hash = $jc(_$hash, receiptId.hashCode);
    _$hash = $jc(_$hash, status.hashCode);
    _$hash = $jc(_$hash, lastError.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ShoppingTrip')
          ..add('id', id)
          ..add('createdAt', createdAt)
          ..add('updatedAt', updatedAt)
          ..add('createdBy', createdBy)
          ..add('createdByString', createdByString)
          ..add('shoppingListId', shoppingListId)
          ..add('receiptId', receiptId)
          ..add('status', status)
          ..add('lastError', lastError))
        .toString();
  }
}

class ShoppingTripBuilder
    implements Builder<ShoppingTrip, ShoppingTripBuilder> {
  _$ShoppingTrip? _$v;

  int? _id;
  int? get id => _$this._id;
  set id(int? id) => _$this._id = id;

  DateTime? _createdAt;
  DateTime? get createdAt => _$this._createdAt;
  set createdAt(DateTime? createdAt) => _$this._createdAt = createdAt;

  DateTime? _updatedAt;
  DateTime? get updatedAt => _$this._updatedAt;
  set updatedAt(DateTime? updatedAt) => _$this._updatedAt = updatedAt;

  int? _createdBy;
  int? get createdBy => _$this._createdBy;
  set createdBy(int? createdBy) => _$this._createdBy = createdBy;

  String? _createdByString;
  String? get createdByString => _$this._createdByString;
  set createdByString(String? createdByString) =>
      _$this._createdByString = createdByString;

  int? _shoppingListId;
  int? get shoppingListId => _$this._shoppingListId;
  set shoppingListId(int? shoppingListId) =>
      _$this._shoppingListId = shoppingListId;

  int? _receiptId;
  int? get receiptId => _$this._receiptId;
  set receiptId(int? receiptId) => _$this._receiptId = receiptId;

  String? _status;
  String? get status => _$this._status;
  set status(String? status) => _$this._status = status;

  String? _lastError;
  String? get lastError => _$this._lastError;
  set lastError(String? lastError) => _$this._lastError = lastError;

  ShoppingTripBuilder() {
    ShoppingTrip._defaults(this);
  }

  ShoppingTripBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _id = $v.id;
      _createdAt = $v.createdAt;
      _updatedAt = $v.updatedAt;
      _createdBy = $v.createdBy;
      _createdByString = $v.createdByString;
      _shoppingListId = $v.shoppingListId;
      _receiptId = $v.receiptId;
      _status = $v.status;
      _lastError = $v.lastError;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ShoppingTrip other) {
    _$v = other as _$ShoppingTrip;
  }

  @override
  void update(void Function(ShoppingTripBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ShoppingTrip build() => _build();

  _$ShoppingTrip _build() {
    final _$result = _$v ??
        _$ShoppingTrip._(
          id: BuiltValueNullFieldError.checkNotNull(id, r'ShoppingTrip', 'id'),
          createdAt: createdAt,
          updatedAt: updatedAt,
          createdBy: createdBy,
          createdByString: createdByString,
          shoppingListId: BuiltValueNullFieldError.checkNotNull(
              shoppingListId, r'ShoppingTrip', 'shoppingListId'),
          receiptId: receiptId,
          status: BuiltValueNullFieldError.checkNotNull(
              status, r'ShoppingTrip', 'status'),
          lastError: BuiltValueNullFieldError.checkNotNull(
              lastError, r'ShoppingTrip', 'lastError'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
