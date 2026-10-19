// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_shopping_list_item_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$UpsertShoppingListItemCommand extends UpsertShoppingListItemCommand {
  @override
  final String name;
  @override
  final String? quantity;
  @override
  final String? note;

  factory _$UpsertShoppingListItemCommand(
          [void Function(UpsertShoppingListItemCommandBuilder)? updates]) =>
      (UpsertShoppingListItemCommandBuilder()..update(updates))._build();

  _$UpsertShoppingListItemCommand._(
      {required this.name, this.quantity, this.note})
      : super._();
  @override
  UpsertShoppingListItemCommand rebuild(
          void Function(UpsertShoppingListItemCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  UpsertShoppingListItemCommandBuilder toBuilder() =>
      UpsertShoppingListItemCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is UpsertShoppingListItemCommand &&
        name == other.name &&
        quantity == other.quantity &&
        note == other.note;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, quantity.hashCode);
    _$hash = $jc(_$hash, note.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'UpsertShoppingListItemCommand')
          ..add('name', name)
          ..add('quantity', quantity)
          ..add('note', note))
        .toString();
  }
}

class UpsertShoppingListItemCommandBuilder
    implements
        Builder<UpsertShoppingListItemCommand,
            UpsertShoppingListItemCommandBuilder> {
  _$UpsertShoppingListItemCommand? _$v;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _quantity;
  String? get quantity => _$this._quantity;
  set quantity(String? quantity) => _$this._quantity = quantity;

  String? _note;
  String? get note => _$this._note;
  set note(String? note) => _$this._note = note;

  UpsertShoppingListItemCommandBuilder() {
    UpsertShoppingListItemCommand._defaults(this);
  }

  UpsertShoppingListItemCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _name = $v.name;
      _quantity = $v.quantity;
      _note = $v.note;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(UpsertShoppingListItemCommand other) {
    _$v = other as _$UpsertShoppingListItemCommand;
  }

  @override
  void update(void Function(UpsertShoppingListItemCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  UpsertShoppingListItemCommand build() => _build();

  _$UpsertShoppingListItemCommand _build() {
    final _$result = _$v ??
        _$UpsertShoppingListItemCommand._(
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'UpsertShoppingListItemCommand', 'name'),
          quantity: quantity,
          note: note,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
