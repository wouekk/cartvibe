// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_overview_category.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$GroupOverviewCategory extends GroupOverviewCategory {
  @override
  final String name;
  @override
  final String total;

  factory _$GroupOverviewCategory(
          [void Function(GroupOverviewCategoryBuilder)? updates]) =>
      (GroupOverviewCategoryBuilder()..update(updates))._build();

  _$GroupOverviewCategory._({required this.name, required this.total})
      : super._();
  @override
  GroupOverviewCategory rebuild(
          void Function(GroupOverviewCategoryBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  GroupOverviewCategoryBuilder toBuilder() =>
      GroupOverviewCategoryBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is GroupOverviewCategory &&
        name == other.name &&
        total == other.total;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, name.hashCode);
    _$hash = $jc(_$hash, total.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'GroupOverviewCategory')
          ..add('name', name)
          ..add('total', total))
        .toString();
  }
}

class GroupOverviewCategoryBuilder
    implements Builder<GroupOverviewCategory, GroupOverviewCategoryBuilder> {
  _$GroupOverviewCategory? _$v;

  String? _name;
  String? get name => _$this._name;
  set name(String? name) => _$this._name = name;

  String? _total;
  String? get total => _$this._total;
  set total(String? total) => _$this._total = total;

  GroupOverviewCategoryBuilder() {
    GroupOverviewCategory._defaults(this);
  }

  GroupOverviewCategoryBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _name = $v.name;
      _total = $v.total;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(GroupOverviewCategory other) {
    _$v = other as _$GroupOverviewCategory;
  }

  @override
  void update(void Function(GroupOverviewCategoryBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  GroupOverviewCategory build() => _build();

  _$GroupOverviewCategory _build() {
    final _$result = _$v ??
        _$GroupOverviewCategory._(
          name: BuiltValueNullFieldError.checkNotNull(
              name, r'GroupOverviewCategory', 'name'),
          total: BuiltValueNullFieldError.checkNotNull(
              total, r'GroupOverviewCategory', 'total'),
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
