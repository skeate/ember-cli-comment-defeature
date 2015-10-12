/// <feature:alpha>
console.log('alpha');
console.log('alpha');
console.log('alpha');
/// </feature:alpha>

/// <feature:bravo>
// I can has nesting?
function bravo() {
  console.log('bravo');
  /// <feature:charlie>
  function charlie() {
    /// <feature:delta>
    console.log('delta');
    /// </feature:delta>
  }
  /// </feature:charlie>
}
/// </feature:bravo>
