// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shopping_list.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ShoppingList extends ShoppingList {
  @override
  final int id;
  @override
  final DateTime? createdAt;
  @override
  final DateTime? updatedAt;
  @override
  final int? createdBy;
  @override
  final int groupId;
  @override
  final String name;
  @override
  final BuiltList<ShoppingListItem> items;

  factory _$ShoppingList([void Function(ShoppingListBuilder)? updates]) =>
      (ShoppingListBuilder()..update(updates))._build();

  _$ShoppingList._(
      {required this.id,
      this.createdAt,
      this.updatedAt,
      this.createdBy,
      required this.groupId,
      required this.name,
      required this.items})
      : super._();
  @override
  ShoppingList rebuild(void Function(ShoppingListBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ShoppingListBuilder toBuilder() => ShoppingListBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ShoppingList &&
        id == other.id &&
        createdAt == other.createdAt &&
        updatedAt == other.updatedAt &&
        createdBy == other.createdBy &&
        groupId == other.groupId &&
        name == other.name &&
        items == other.items;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, id.hashCode);
    _$hash = $jc(_$hash, createdAt.hashCode);
    _$hash = $jc(_$hash, updatedAt.hashCode);
    _$hash = $jc(_$hash, createdBy.hashCode);
    _$hash = $jc(_$hash, groupId.hashCode);
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, items.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ShoppingList')
          ..add('id', id)
          ..add('createdAt', createdAt)
          ..add('updatedAt', updatedAt)
          ..add('createdBy', createdBy)
          ..add('groupId', groupId)
          ..add('name', name)
          ..add('items', items))
        .toString();
  }
}

class ShoppingListBuilder
    implements Builder<ShoppingList, ShoppingListBuilder> {
  _$ShoppingList? _$v;

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

  int? _groupId;
  int? get groupId => _$this._groupId;
  set groupId(int? groupId) => _$this._groupId = groupId;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  ListBuilder<ShoppingListItem>? _items;
  ListBuilder<ShoppingListItem> get items =>
      _$this._items ??= ListBuilder<ShoppingListItem>();
  set items(ListBuilder<ShoppingListItem>? items) => _$this._items = items;

  ShoppingListBuilder() {
    ShoppingList._defaults(this);
  }

  ShoppingListBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _id = $v.id;
      _createdAt = $v.createdAt;
      _updatedAt = $v.updatedAt;
      _createdBy = $v.createdBy;
      _groupId = $v.groupId;
      _name = $v.name;
      _items = $v.items.toBuilder();
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ShoppingList other) {
    _$v = other as _$ShoppingList;
  }

  @override
  void update(void Function(ShoppingListBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ShoppingList build() => _build();

  _$ShoppingList _build() {
    _$ShoppingList _$result;
    try {
      _$result = _$v ??
          _$ShoppingList._(
            id: BuiltValueNullFieldError.checkNotNull(
                id, r'ShoppingList', 'id'),
            createdAt: createdAt,
            updatedAt: updatedAt,
            createdBy: createdBy,
            groupId: BuiltValueNullFieldError.checkNotNull(
                groupId, r'ShoppingList', 'groupId'),
            name: BuiltValueNullFieldError.checkNotNull(
                name, r'ShoppingList', 'name'),
            items: items.build(),
          );
    } catch (_) {
      late String _$failedField;
      try {
        _$failedField = 'items';
        items.build();
      } catch (e) {
        throw BuiltValueNestedFieldError(
            r'ShoppingList', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
