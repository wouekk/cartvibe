// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'receipt_product.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ReceiptProduct extends ReceiptProduct {
  @override
  final int id;
  @override
  final DateTime? createdAt;
  @override
  final DateTime? updatedAt;
  @override
  final int? createdBy;
  @override
  final int receiptId;
  @override
  final String name;
  @override
  final String displayName;
  @override
  final String? amount;
  @override
  final String quantity;
  @override
  final int position;

  factory _$ReceiptProduct([void Function(ReceiptProductBuilder)? updates]) =>
      (ReceiptProductBuilder()..update(updates))._build();

  _$ReceiptProduct._(
      {required this.id,
      this.createdAt,
      this.updatedAt,
      this.createdBy,
      required this.receiptId,
      required this.name,
      required this.displayName,
      this.amount,
      required this.quantity,
      required this.position})
      : super._();
  @override
  ReceiptProduct rebuild(void Function(ReceiptProductBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ReceiptProductBuilder toBuilder() => ReceiptProductBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ReceiptProduct &&
        id == other.id &&
        createdAt == other.createdAt &&
        updatedAt == other.updatedAt &&
        createdBy == other.createdBy &&
        receiptId == other.receiptId &&
        name == other.name &&
        displayName == other.displayName &&
        amount == other.amount &&
        quantity == other.quantity &&
        position == other.position;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, id.hashCode);
    _$hash = $jc(_$hash, createdAt.hashCode);
    _$hash = $jc(_$hash, updatedAt.hashCode);
    _$hash = $jc(_$hash, createdBy.hashCode);
    _$hash = $jc(_$hash, receiptId.hashCode);
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, displayName.hashCode);
    _$hash = $jc(_$hash, amount.hashCode);
    _$hash = $jc(_$hash, quantity.hashCode);
    _$hash = $jc(_$hash, position.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ReceiptProduct')
          ..add('id', id)
          ..add('createdAt', createdAt)
          ..add('updatedAt', updatedAt)
          ..add('createdBy', createdBy)
          ..add('receiptId', receiptId)
          ..add('name', name)
          ..add('displayName', displayName)
          ..add('amount', amount)
          ..add('quantity', quantity)
          ..add('position', position))
        .toString();
  }
}

class ReceiptProductBuilder
    implements Builder<ReceiptProduct, ReceiptProductBuilder> {
  _$ReceiptProduct? _$v;

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

  int? _receiptId;
  int? get receiptId => _$this._receiptId;
  set receiptId(int? receiptId) => _$this._receiptId = receiptId;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _displayName;
  String? get displayName => _$this._displayName;
  set displayName(String? displayName) => _$this._displayName = displayName;

  String? _amount;
  String? get amount => _$this._amount;
  set amount(String? amount) => _$this._amount = amount;

  String? _quantity;
  String? get quantity => _$this._quantity;
  set quantity(String? quantity) => _$this._quantity = quantity;

  int? _position;
  int? get position => _$this._position;
  set position(int? position) => _$this._position = position;

  ReceiptProductBuilder() {
    ReceiptProduct._defaults(this);
  }

  ReceiptProductBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _id = $v.id;
      _createdAt = $v.createdAt;
      _updatedAt = $v.updatedAt;
      _createdBy = $v.createdBy;
      _receiptId = $v.receiptId;
      _name = $v.name;
      _displayName = $v.displayName;
      _amount = $v.amount;
      _quantity = $v.quantity;
      _position = $v.position;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ReceiptProduct other) {
    _$v = other as _$ReceiptProduct;
  }

  @override
  void update(void Function(ReceiptProductBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ReceiptProduct build() => _build();

  _$ReceiptProduct _build() {
    final _$result = _$v ??
        _$ReceiptProduct._(
          id: BuiltValueNullFieldError.checkNotNull(
              id, r'ReceiptProduct', 'id'),
          createdAt: createdAt,
          updatedAt: updatedAt,
          createdBy: createdBy,
          receiptId: BuiltValueNullFieldError.checkNotNull(
              receiptId, r'ReceiptProduct', 'receiptId'),
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'ReceiptProduct', 'name'),
          displayName: BuiltValueNullFieldError.checkNotNull(
              displayName, r'ReceiptProduct', 'displayName'),
          amount: amount,
          quantity: BuiltValueNullFieldError.checkNotNull(
              quantity, r'ReceiptProduct', 'quantity'),
          position: BuiltValueNullFieldError.checkNotNull(
              position, r'ReceiptProduct', 'position'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
