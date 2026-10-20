// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shopping_trip_receipt.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ShoppingTripReceipt extends ShoppingTripReceipt {
  @override
  final int id;
  @override
  final String name;
  @override
  final DateTime date;
  @override
  final String amount;

  factory _$ShoppingTripReceipt(
          [void Function(ShoppingTripReceiptBuilder)? updates]) =>
      (ShoppingTripReceiptBuilder()..update(updates))._build();

  _$ShoppingTripReceipt._(
      {required this.id,
      required this.name,
      required this.date,
      required this.amount})
      : super._();
  @override
  ShoppingTripReceipt rebuild(
          void Function(ShoppingTripReceiptBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ShoppingTripReceiptBuilder toBuilder() =>
      ShoppingTripReceiptBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ShoppingTripReceipt &&
        id == other.id &&
        name == other.name &&
        date == other.date &&
        amount == other.amount;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, id.hashCode);
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, date.hashCode);
    _$hash = $jc(_$hash, amount.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ShoppingTripReceipt')
          ..add('id', id)
          ..add('name', name)
          ..add('date', date)
          ..add('amount', amount))
        .toString();
  }
}

class ShoppingTripReceiptBuilder
    implements Builder<ShoppingTripReceipt, ShoppingTripReceiptBuilder> {
  _$ShoppingTripReceipt? _$v;

  int? _id;
  int? get id => _$this._id;
  set id(int? id) => _$this._id = id;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  DateTime? _date;
  DateTime? get date => _$this._date;
  set date(DateTime? date) => _$this._date = date;

  String? _amount;
  String? get amount => _$this._amount;
  set amount(String? amount) => _$this._amount = amount;

  ShoppingTripReceiptBuilder() {
    ShoppingTripReceipt._defaults(this);
  }

  ShoppingTripReceiptBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _id = $v.id;
      _name = $v.name;
      _date = $v.date;
      _amount = $v.amount;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ShoppingTripReceipt other) {
    _$v = other as _$ShoppingTripReceipt;
  }

  @override
  void update(void Function(ShoppingTripReceiptBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ShoppingTripReceipt build() => _build();

  _$ShoppingTripReceipt _build() {
    final _$result = _$v ??
        _$ShoppingTripReceipt._(
          id: BuiltValueNullFieldError.checkNotNull(
              id, r'ShoppingTripReceipt', 'id'),
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'ShoppingTripReceipt', 'name'),
          date: BuiltValueNullFieldError.checkNotNull(
              date, r'ShoppingTripReceipt', 'date'),
          amount: BuiltValueNullFieldError.checkNotNull(
              amount, r'ShoppingTripReceipt', 'amount'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
