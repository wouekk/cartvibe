// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_overview_month.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$GroupOverviewMonth extends GroupOverviewMonth {
  @override
  final String month;
  @override
  final String total;

  factory _$GroupOverviewMonth(
          [void Function(GroupOverviewMonthBuilder)? updates]) =>
      (GroupOverviewMonthBuilder()..update(updates))._build();

  _$GroupOverviewMonth._({required this.month, required this.total})
      : super._();
  @override
  GroupOverviewMonth rebuild(
          void Function(GroupOverviewMonthBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  GroupOverviewMonthBuilder toBuilder() =>
      GroupOverviewMonthBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is GroupOverviewMonth &&
        month == other.month &&
        total == other.total;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, month.hashCode);
    _$hash = $jc(_$hash, total.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'GroupOverviewMonth')
          ..add('month', month)
          ..add('total', total))
        .toString();
  }
}

class GroupOverviewMonthBuilder
    implements Builder<GroupOverviewMonth, GroupOverviewMonthBuilder> {
  _$GroupOverviewMonth? _$v;

  String? _month;
  String? get month => _$this._month;
  set month(String? month) => _$this._month = month;

  String? _total;
  String? get total => _$this._total;
  set total(String? total) => _$this._total = total;

  GroupOverviewMonthBuilder() {
    GroupOverviewMonth._defaults(this);
  }

  GroupOverviewMonthBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _month = $v.month;
      _total = $v.total;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(GroupOverviewMonth other) {
    _$v = other as _$GroupOverviewMonth;
  }

  @override
  void update(void Function(GroupOverviewMonthBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  GroupOverviewMonth build() => _build();

  _$GroupOverviewMonth _build() {
    final _$result = _$v ??
        _$GroupOverviewMonth._(
          month: BuiltValueNullFieldError.checkNotNull(
              month, r'GroupOverviewMonth', 'month'),
          total: BuiltValueNullFieldError.checkNotNull(
              total, r'GroupOverviewMonth', 'total'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
