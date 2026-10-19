// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shopping_list_item.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ShoppingListItem extends ShoppingListItem {
  @override
  final int id;
  @override
  final DateTime? createdAt;
  @override
  final DateTime? updatedAt;
  @override
  final int? createdBy;
  @override
  final int shoppingListId;
  @override
  final String name;
  @override
  final String? amount;
  @override
  final String unit;
  @override
  final String quantity;
  @override
  final String note;
  @override
  final bool isChecked;
  @override
  final DateTime? checkedAt;
  @override
  final int? checkedByUserId;

  factory _$ShoppingListItem(
          [void Function(ShoppingListItemBuilder)? updates]) =>
      (ShoppingListItemBuilder()..update(updates))._build();

  _$ShoppingListItem._(
      {required this.id,
      this.createdAt,
      this.updatedAt,
      this.createdBy,
      required this.shoppingListId,
      required this.name,
      this.amount,
      required this.unit,
      required this.quantity,
      required this.note,
      required this.isChecked,
      this.checkedAt,
      this.checkedByUserId})
      : super._();
  @override
  ShoppingListItem rebuild(void Function(ShoppingListItemBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ShoppingListItemBuilder toBuilder() =>
      ShoppingListItemBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ShoppingListItem &&
        id == other.id &&
        createdAt == other.createdAt &&
        updatedAt == other.updatedAt &&
        createdBy == other.createdBy &&
        shoppingListId == other.shoppingListId &&
        name == other.name &&
        amount == other.amount &&
        unit == other.unit &&
        quantity == other.quantity &&
        note == other.note &&
        isChecked == other.isChecked &&
        checkedAt == other.checkedAt &&
        checkedByUserId == other.checkedByUserId;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, id.hashCode);
    _$hash = $jc(_$hash, createdAt.hashCode);
    _$hash = $jc(_$hash, updatedAt.hashCode);
    _$hash = $jc(_$hash, createdBy.hashCode);
    _$hash = $jc(_$hash, shoppingListId.hashCode);
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, amount.hashCode);
    _$hash = $jc(_$hash, unit.hashCode);
    _$hash = $jc(_$hash, quantity.hashCode);
    _$hash = $jc(_$hash, note.hashCode);
    _$hash = $jc(_$hash, isChecked.hashCode);
    _$hash = $jc(_$hash, checkedAt.hashCode);
    _$hash = $jc(_$hash, checkedByUserId.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ShoppingListItem')
          ..add('id', id)
          ..add('createdAt', createdAt)
          ..add('updatedAt', updatedAt)
          ..add('createdBy', createdBy)
          ..add('shoppingListId', shoppingListId)
          ..add('name', name)
          ..add('amount', amount)
          ..add('unit', unit)
          ..add('quantity', quantity)
          ..add('note', note)
          ..add('isChecked', isChecked)
          ..add('checkedAt', checkedAt)
          ..add('checkedByUserId', checkedByUserId))
        .toString();
  }
}

class ShoppingListItemBuilder
    implements Builder<ShoppingListItem, ShoppingListItemBuilder> {
  _$ShoppingListItem? _$v;

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

  int? _shoppingListId;
  int? get shoppingListId => _$this._shoppingListId;
  set shoppingListId(int? shoppingListId) =>
      _$this._shoppingListId = shoppingListId;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _amount;
  String? get amount => _$this._amount;
  set amount(String? amount) => _$this._amount = amount;

  String? _unit;
  String? get unit => _$this._unit;
  set unit(String? unit) => _$this._unit = unit;

  String? _quantity;
  String? get quantity => _$this._quantity;
  set quantity(String? quantity) => _$this._quantity = quantity;

  String? _note;
  String? get note => _$this._note;
  set note(String? note) => _$this._note = note;

  bool? _isChecked;
  bool? get isChecked => _$this._isChecked;
  set isChecked(bool? isChecked) => _$this._isChecked = isChecked;

  DateTime? _checkedAt;
  DateTime? get checkedAt => _$this._checkedAt;
  set checkedAt(DateTime? checkedAt) => _$this._checkedAt = checkedAt;

  int? _checkedByUserId;
  int? get checkedByUserId => _$this._checkedByUserId;
  set checkedByUserId(int? checkedByUserId) =>
      _$this._checkedByUserId = checkedByUserId;

  ShoppingListItemBuilder() {
    ShoppingListItem._defaults(this);
  }

  ShoppingListItemBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _id = $v.id;
      _createdAt = $v.createdAt;
      _updatedAt = $v.updatedAt;
      _createdBy = $v.createdBy;
      _shoppingListId = $v.shoppingListId;
      _name = $v.name;
      _amount = $v.amount;
      _unit = $v.unit;
      _quantity = $v.quantity;
      _note = $v.note;
      _isChecked = $v.isChecked;
      _checkedAt = $v.checkedAt;
      _checkedByUserId = $v.checkedByUserId;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ShoppingListItem other) {
    _$v = other as _$ShoppingListItem;
  }

  @override
  void update(void Function(ShoppingListItemBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ShoppingListItem build() => _build();

  _$ShoppingListItem _build() {
    final _$result = _$v ??
        _$ShoppingListItem._(
          id: BuiltValueNullFieldError.checkNotNull(
              id, r'ShoppingListItem', 'id'),
          createdAt: createdAt,
          updatedAt: updatedAt,
          createdBy: createdBy,
          shoppingListId: BuiltValueNullFieldError.checkNotNull(
              shoppingListId, r'ShoppingListItem', 'shoppingListId'),
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'ShoppingListItem', 'name'),
          amount: amount,
          unit: BuiltValueNullFieldError.checkNotNull(
              unit, r'ShoppingListItem', 'unit'),
          quantity: BuiltValueNullFieldError.checkNotNull(
              quantity, r'ShoppingListItem', 'quantity'),
          note: BuiltValueNullFieldError.checkNotNull(
              note, r'ShoppingListItem', 'note'),
          isChecked: BuiltValueNullFieldError.checkNotNull(
              isChecked, r'ShoppingListItem', 'isChecked'),
          checkedAt: checkedAt,
          checkedByUserId: checkedByUserId,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
