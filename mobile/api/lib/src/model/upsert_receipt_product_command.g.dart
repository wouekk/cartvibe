// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_receipt_product_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$UpsertReceiptProductCommand extends UpsertReceiptProductCommand {
  @override
  final String name;
  @override
  final String? amount;
  @override
  final String? quantity;

  factory _$UpsertReceiptProductCommand(
          [void Function(UpsertReceiptProductCommandBuilder)? updates]) =>
      (UpsertReceiptProductCommandBuilder()..update(updates))._build();

  _$UpsertReceiptProductCommand._(
      {required this.name, this.amount, this.quantity})
      : super._();
  @override
  UpsertReceiptProductCommand rebuild(
          void Function(UpsertReceiptProductCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  UpsertReceiptProductCommandBuilder toBuilder() =>
      UpsertReceiptProductCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is UpsertReceiptProductCommand &&
        name == other.name &&
        amount == other.amount &&
        quantity == other.quantity;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, amount.hashCode);
    _$hash = $jc(_$hash, quantity.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'UpsertReceiptProductCommand')
          ..add('name', name)
          ..add('amount', amount)
          ..add('quantity', quantity))
        .toString();
  }
}

class UpsertReceiptProductCommandBuilder
    implements
        Builder<UpsertReceiptProductCommand,
            UpsertReceiptProductCommandBuilder> {
  _$UpsertReceiptProductCommand? _$v;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _amount;
  String? get amount => _$this._amount;
  set amount(String? amount) => _$this._amount = amount;

  String? _quantity;
  String? get quantity => _$this._quantity;
  set quantity(String? quantity) => _$this._quantity = quantity;

  UpsertReceiptProductCommandBuilder() {
    UpsertReceiptProductCommand._defaults(this);
  }

  UpsertReceiptProductCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _name = $v.name;
      _amount = $v.amount;
      _quantity = $v.quantity;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(UpsertReceiptProductCommand other) {
    _$v = other as _$UpsertReceiptProductCommand;
  }

  @override
  void update(void Function(UpsertReceiptProductCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  UpsertReceiptProductCommand build() => _build();

  _$UpsertReceiptProductCommand _build() {
    final _$result = _$v ??
        _$UpsertReceiptProductCommand._(
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'UpsertReceiptProductCommand', 'name'),
          amount: amount,
          quantity: quantity,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
