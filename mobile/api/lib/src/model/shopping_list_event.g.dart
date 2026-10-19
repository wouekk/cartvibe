// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shopping_list_event.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ShoppingListEvent extends ShoppingListEvent {
  @override
  final String type;
  @override
  final int groupId;
  @override
  final int shoppingListId;
  @override
  final ShoppingList? list;
  @override
  final ShoppingListItem? item;
  @override
  final BuiltList<int>? itemIds;

  factory _$ShoppingListEvent(
          [void Function(ShoppingListEventBuilder)? updates]) =>
      (ShoppingListEventBuilder()..update(updates))._build();

  _$ShoppingListEvent._(
      {required this.type,
      required this.groupId,
      required this.shoppingListId,
      this.list,
      this.item,
      this.itemIds})
      : super._();
  @override
  ShoppingListEvent rebuild(void Function(ShoppingListEventBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ShoppingListEventBuilder toBuilder() =>
      ShoppingListEventBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ShoppingListEvent &&
        type == other.type &&
        groupId == other.groupId &&
        shoppingListId == other.shoppingListId &&
        list == other.list &&
        item == other.item &&
        itemIds == other.itemIds;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, type.hashCode);
    _$hash = $jc(_$hash, groupId.hashCode);
    _$hash = $jc(_$hash, shoppingListId.hashCode);
    _$hash = $jc(_$hash, list.hashCode);
    _$hash = $jc(_$hash, item.hashCode);
    _$hash = $jc(_$hash, itemIds.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ShoppingListEvent')
          ..add('type', type)
          ..add('groupId', groupId)
          ..add('shoppingListId', shoppingListId)
          ..add('list', list)
          ..add('item', item)
          ..add('itemIds', itemIds))
        .toString();
  }
}

class ShoppingListEventBuilder
    implements Builder<ShoppingListEvent, ShoppingListEventBuilder> {
  _$ShoppingListEvent? _$v;

  String? _type;
  String? get type => _$this._type;
  set type(String? type) => _$this._type = type;

  int? _groupId;
  int? get groupId => _$this._groupId;
  set groupId(int? groupId) => _$this._groupId = groupId;

  int? _shoppingListId;
  int? get shoppingListId => _$this._shoppingListId;
  set shoppingListId(int? shoppingListId) =>
      _$this._shoppingListId = shoppingListId;

  ShoppingListBuilder? _list;
  ShoppingListBuilder get list => _$this._list ??= ShoppingListBuilder();
  set list(ShoppingListBuilder? list) => _$this._list = list;

  ShoppingListItemBuilder? _item;
  ShoppingListItemBuilder get item =>
      _$this._item ??= ShoppingListItemBuilder();
  set item(ShoppingListItemBuilder? item) => _$this._item = item;

  ListBuilder<int>? _itemIds;
  ListBuilder<int> get itemIds => _$this._itemIds ??= ListBuilder<int>();
  set itemIds(ListBuilder<int>? itemIds) => _$this._itemIds = itemIds;

  ShoppingListEventBuilder() {
    ShoppingListEvent._defaults(this);
  }

  ShoppingListEventBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _type = $v.type;
      _groupId = $v.groupId;
      _shoppingListId = $v.shoppingListId;
      _list = $v.list?.toBuilder();
      _item = $v.item?.toBuilder();
      _itemIds = $v.itemIds?.toBuilder();
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ShoppingListEvent other) {
    _$v = other as _$ShoppingListEvent;
  }

  @override
  void update(void Function(ShoppingListEventBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ShoppingListEvent build() => _build();

  _$ShoppingListEvent _build() {
    _$ShoppingListEvent _$result;
    try {
      _$result = _$v ??
          _$ShoppingListEvent._(
            type: BuiltValueNullFieldError.checkNotNull(
                type, r'ShoppingListEvent', 'type'),
            groupId: BuiltValueNullFieldError.checkNotNull(
                groupId, r'ShoppingListEvent', 'groupId'),
            shoppingListId: BuiltValueNullFieldError.checkNotNull(
                shoppingListId, r'ShoppingListEvent', 'shoppingListId'),
            list: _list?.build(),
            item: _item?.build(),
            itemIds: _itemIds?.build(),
          );
    } catch (_) {
      late String _$failedField;
      try {
        _$failedField = 'list';
        _list?.build();
        _$failedField = 'item';
        _item?.build();
        _$failedField = 'itemIds';
        _itemIds?.build();
      } catch (e) {
        throw BuiltValueNestedFieldError(
            r'ShoppingListEvent', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
