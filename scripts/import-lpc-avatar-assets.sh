#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/../external/universal-lpc" && pwd)"
destination_dir="$(cd "$(dirname "$0")/.." && pwd)/client/public/assets/avatar/lpc"
actions=(idle walk run slash hurt shoot thrust sit)

copy_layer() {
  local source_path="$1"
  local destination_path="$2"
  mkdir -p "$destination_dir/$destination_path"
  for action in "${actions[@]}"; do
    cp "$repo_dir/spritesheets/$source_path/$action.png" "$destination_dir/$destination_path/$action.png"
  done
}

# The upstream library has a few valid layers that do not ship every one of
# the eight actions used by the game. For those sheets, an idle frame sheet is
# a safer fallback than leaving a broken URL in the client catalog.
copy_flexible_layer() {
  local source_path="$1"
  local destination_path="$2"
  mkdir -p "$destination_dir/$destination_path"
  for action in "${actions[@]}"; do
    local source_file="$repo_dir/spritesheets/$source_path/$action.png"
    if [[ ! -f "$source_file" ]]; then
      source_file="$repo_dir/spritesheets/$source_path/idle.png"
    fi
    cp "$source_file" "$destination_dir/$destination_path/$action.png"
  done
}

profile_candidates() {
  local profile="$1"
  case "$profile" in
    male) printf '%s\n' male adult ;;
    female) printf '%s\n' female thin adult male ;;
    teen) printf '%s\n' teen thin adult male female ;;
    pregnant) printf '%s\n' pregnant female thin adult male ;;
    *) return 1 ;;
  esac
}

source_variant() {
  local source_path="$1"
  case "${source_path##*/}" in
    male|female|teen|pregnant|thin|adult|muscular|child) printf '%s\n' "${source_path##*/}" ;;
    *) printf '%s\n' '' ;;
  esac
}

find_profile_source() {
  local base_path="$1"
  local profile="$2"
  local fallback_source="$3"
  local candidate_variant
  local candidate_path

  while IFS= read -r candidate_variant; do
    candidate_path="$repo_dir/spritesheets/$base_path/$candidate_variant"
    if [[ -f "$candidate_path/idle.png" ]]; then
      printf '%s\n' "$base_path/$candidate_variant"
      return
    fi
  done < <(profile_candidates "$profile")

  if [[ -f "$repo_dir/spritesheets/$base_path/idle.png" ]]; then
    printf '%s\n' "$base_path"
    return
  fi

  # Some upstream sheets are already profile-independent (for example a
  # scarf or an adult hat). Reuse the source selected for this item instead
  # of manufacturing a broken path for a profile with no dedicated variant.
  printf '%s\n' "$fallback_source"
}

copy_profiled_indexed_layers() {
  local source_root="$1"
  local destination_root="$2"
  local limit="$3"
  local source_root_dir="$repo_dir/spritesheets/$source_root"
  local index=0
  while IFS= read -r source_file; do
    index=$((index + 1))
    if (( index > limit )); then
      break
    fi
    local source_path="${source_file#"$repo_dir/spritesheets/"}"
    source_path="${source_path%/idle.png}"
    local variant="$(source_variant "$source_path")"
    local base_path="$source_path"
    if [[ -n "$variant" ]]; then
      base_path="${source_path%/"$variant"}"
    fi
    local destination_index="$destination_root/$(printf '%03d' "$index")"
    local profile
    for profile in male female teen pregnant; do
      local profile_source
      profile_source="$(find_profile_source "$base_path" "$profile" "$source_path")"
      copy_flexible_layer "$profile_source" "$destination_index/$profile"
    done
  done < <(find "$source_root_dir" -type f -name idle.png -print | sort)
}

copy_layer "body/bodies/male" "body/male"
copy_layer "body/bodies/female" "body/female"
copy_layer "body/bodies/teen" "body/teen"
copy_layer "body/bodies/pregnant" "body/pregnant"
copy_layer "head/heads/human/male" "head/male"
copy_layer "head/heads/human/female" "head/female"
copy_layer "head/heads/human/male_gaunt" "head/male-gaunt"
copy_layer "head/heads/human/female_small" "head/female-small"
copy_layer "head/heads/human/male_elderly" "head/male-elderly"
copy_layer "head/heads/human/female_elderly" "head/female-elderly"
copy_layer "head/heads/human/male_plump" "head/male-plump"
copy_layer "head/heads/human/male_small" "head/male-small"

copy_layer "hair/plain/adult" "hair/plain"
copy_layer "hair/bob/adult" "hair/bob"
copy_layer "hair/messy2/adult" "hair/messy2"
copy_layer "hair/pixie/adult" "hair/pixie"
copy_layer "hair/afro/adult" "hair/afro"
copy_layer "hair/bangs/adult" "hair/bangs"
copy_layer "hair/bedhead/adult" "hair/bedhead"
copy_layer "hair/bob_side_part/adult" "hair/bob-side-part"
copy_layer "hair/buzzcut/adult" "hair/buzzcut"
copy_layer "hair/cornrows/adult" "hair/cornrows"
copy_layer "hair/curly_long/adult" "hair/curly-long"
copy_layer "hair/curly_short/adult" "hair/curly-short"
copy_layer "hair/curtains/adult" "hair/curtains"
copy_layer "hair/dreadlocks_long/adult" "hair/dreadlocks-long"
copy_layer "hair/long/adult" "hair/long"
copy_layer "hair/long_messy/adult" "hair/long-messy"
copy_layer "hair/mop/adult" "hair/mop"
copy_layer "hair/flat_top_fade/adult" "hair/flat-top-fade"
copy_layer "hair/half_up/adult" "hair/half-up"
copy_layer "hair/pigtails/adult" "hair/pigtails"
copy_layer "hair/spiked/adult" "hair/spiked"
copy_layer "hair/bangs_bun/adult" "hair/bangs-bun"
copy_layer "hair/loose/adult" "hair/loose"
copy_layer "hair/jewfro/adult" "hair/jewfro"

# Distinctive face details. These are kept in one slot so the starter creator
# can offer many identity options without locking future accessory/shop slots.
copy_layer "facial/glasses/glasses/adult" "feature/glasses"
copy_layer "facial/glasses/round/adult" "feature/round-glasses"
copy_layer "facial/glasses/nerd/adult" "feature/nerd-glasses"
copy_layer "facial/glasses/shades/adult" "feature/shades"
copy_layer "facial/patches/eyepatch/ambi/adult" "feature/eyepatch"
copy_layer "beards/beard/basic" "feature/beard"
copy_layer "beards/beard/medium" "feature/medium-beard"
copy_layer "beards/beard/trimmed" "feature/trimmed-beard"
copy_layer "beards/beard/5oclock_shadow" "feature/five-oclock"
copy_layer "beards/mustache/basic" "feature/mustache"

copy_layer "torso/clothes/shortsleeve/tshirt/male" "top/tshirt/male"
copy_layer "torso/clothes/shortsleeve/tshirt/female" "top/tshirt/female"
copy_layer "torso/clothes/shortsleeve/tshirt/teen" "top/tshirt/teen"
copy_layer "torso/clothes/shortsleeve/tshirt/female" "top/tshirt/pregnant"
copy_layer "torso/clothes/longsleeve/longsleeve/male" "top/longsleeve/male"
copy_layer "torso/clothes/longsleeve/longsleeve/female" "top/longsleeve/female"
copy_layer "torso/clothes/longsleeve/longsleeve/teen" "top/longsleeve/teen"
copy_layer "torso/clothes/longsleeve/longsleeve/female" "top/longsleeve/pregnant"
copy_layer "torso/clothes/shortsleeve/tshirt_vneck/male" "top/vneck/male"
copy_layer "torso/clothes/shortsleeve/tshirt_vneck/female" "top/vneck/female"
copy_layer "torso/clothes/shortsleeve/tshirt_vneck/teen" "top/vneck/teen"
copy_layer "torso/clothes/shortsleeve/tshirt_vneck/female" "top/vneck/pregnant"
copy_layer "torso/clothes/shortsleeve/shortsleeve_polo/male" "top/polo/male"
copy_layer "torso/clothes/shortsleeve/shortsleeve_polo/female" "top/polo/female"
copy_layer "torso/clothes/shortsleeve/shortsleeve_polo/teen" "top/polo/teen"
copy_layer "torso/clothes/shortsleeve/shortsleeve_polo/female" "top/polo/pregnant"
copy_layer "torso/clothes/shortsleeve/shortsleeve_cardigan/male" "top/cardigan/male"
copy_layer "torso/clothes/shortsleeve/shortsleeve_cardigan/female" "top/cardigan/female"
copy_layer "torso/clothes/shortsleeve/shortsleeve_cardigan/teen" "top/cardigan/teen"
copy_layer "torso/clothes/shortsleeve/shortsleeve_cardigan/female" "top/cardigan/pregnant"
copy_layer "torso/clothes/shortsleeve/tshirt_buttoned/male" "top/buttoned/male"
copy_layer "torso/clothes/shortsleeve/tshirt_buttoned/female" "top/buttoned/female"
copy_layer "torso/clothes/shortsleeve/tshirt_buttoned/teen" "top/buttoned/teen"
copy_layer "torso/clothes/shortsleeve/tshirt_buttoned/female" "top/buttoned/pregnant"
copy_layer "torso/clothes/shortsleeve/tshirt_scoop/male" "top/scoop/male"
copy_layer "torso/clothes/shortsleeve/tshirt_scoop/female" "top/scoop/female"
copy_layer "torso/clothes/shortsleeve/tshirt_scoop/teen" "top/scoop/teen"
copy_layer "torso/clothes/shortsleeve/tshirt_scoop/female" "top/scoop/pregnant"
copy_layer "torso/clothes/longsleeve/longsleeve2_polo/male" "top/long-polo/male"
copy_layer "torso/clothes/longsleeve/longsleeve2_polo/female" "top/long-polo/female"
copy_layer "torso/clothes/longsleeve/longsleeve2_polo/teen" "top/long-polo/teen"
copy_layer "torso/clothes/longsleeve/longsleeve2_polo/female" "top/long-polo/pregnant"
copy_layer "torso/clothes/longsleeve/longsleeve2_cardigan/male" "top/long-cardigan/male"
copy_layer "torso/clothes/longsleeve/longsleeve2_cardigan/female" "top/long-cardigan/female"
copy_layer "torso/clothes/longsleeve/longsleeve2_cardigan/teen" "top/long-cardigan/teen"
copy_layer "torso/clothes/longsleeve/longsleeve2_cardigan/female" "top/long-cardigan/pregnant"
copy_layer "torso/clothes/sleeveless/sleeveless1/male" "top/sleeveless/male"
copy_layer "torso/clothes/sleeveless/sleeveless1/female" "top/sleeveless/female"
copy_layer "torso/clothes/sleeveless/sleeveless1/teen" "top/sleeveless/teen"
copy_layer "torso/clothes/sleeveless/sleeveless1/female" "top/sleeveless/pregnant"
copy_layer "torso/clothes/longsleeve/longsleeve2_buttoned/male" "top/long-buttoned/male"
copy_layer "torso/clothes/longsleeve/longsleeve2_buttoned/female" "top/long-buttoned/female"
copy_layer "torso/clothes/longsleeve/longsleeve2_buttoned/teen" "top/long-buttoned/teen"
copy_layer "torso/clothes/longsleeve/longsleeve2_buttoned/female" "top/long-buttoned/pregnant"
copy_layer "torso/clothes/longsleeve/longsleeve2_vneck/male" "top/long-vneck/male"
copy_layer "torso/clothes/longsleeve/longsleeve2_vneck/female" "top/long-vneck/female"
copy_layer "torso/clothes/longsleeve/longsleeve2_vneck/teen" "top/long-vneck/teen"
copy_layer "torso/clothes/longsleeve/longsleeve2_vneck/female" "top/long-vneck/pregnant"
copy_layer "torso/clothes/shortsleeve/shortsleeves2/male" "top/relaxed-shirt/male"
copy_layer "torso/clothes/shortsleeve/shortsleeves2/female" "top/relaxed-shirt/female"
copy_layer "torso/clothes/shortsleeve/shortsleeves2/teen" "top/relaxed-shirt/teen"
copy_layer "torso/clothes/shortsleeve/shortsleeves2/female" "top/relaxed-shirt/pregnant"
copy_layer "torso/clothes/sleeveless/sleeveless2_buttoned/male" "top/sleeveless-buttoned/male"
copy_layer "torso/clothes/sleeveless/sleeveless2_buttoned/female" "top/sleeveless-buttoned/female"
copy_layer "torso/clothes/sleeveless/sleeveless2_buttoned/teen" "top/sleeveless-buttoned/teen"
copy_layer "torso/clothes/sleeveless/sleeveless2_buttoned/female" "top/sleeveless-buttoned/pregnant"

copy_layer "legs/pants/male" "bottom/pants/male"
copy_layer "legs/pants/thin" "bottom/pants/female"
copy_layer "legs/pants/thin" "bottom/pants/teen"
copy_layer "legs/pants/thin" "bottom/pants/pregnant"
copy_layer "legs/shorts/shorts/male" "bottom/shorts/male"
copy_layer "legs/shorts/shorts/thin" "bottom/shorts/female"
copy_layer "legs/shorts/shorts/thin" "bottom/shorts/teen"
copy_layer "legs/shorts/shorts/thin" "bottom/shorts/pregnant"
copy_layer "legs/formal/male" "bottom/formal/male"
copy_layer "legs/formal/thin" "bottom/formal/female"
copy_layer "legs/formal/thin" "bottom/formal/teen"
copy_layer "legs/formal/thin" "bottom/formal/pregnant"
copy_layer "legs/cuffed/male" "bottom/cuffed/male"
copy_layer "legs/cuffed/thin" "bottom/cuffed/female"
copy_layer "legs/cuffed/thin" "bottom/cuffed/teen"
copy_layer "legs/cuffed/thin" "bottom/cuffed/pregnant"
copy_layer "legs/pants2/male" "bottom/pants2/male"
copy_layer "legs/pants2/thin" "bottom/pants2/female"
copy_layer "legs/pants2/thin" "bottom/pants2/teen"
copy_layer "legs/pants2/thin" "bottom/pants2/pregnant"
copy_layer "legs/formal_striped/male" "bottom/formal-striped/male"
copy_layer "legs/formal_striped/thin" "bottom/formal-striped/female"
copy_layer "legs/formal_striped/thin" "bottom/formal-striped/teen"
copy_layer "legs/formal_striped/thin" "bottom/formal-striped/pregnant"
copy_layer "legs/leggings/male" "bottom/leggings/male"
copy_layer "legs/leggings/thin" "bottom/leggings/female"
copy_layer "legs/leggings/thin" "bottom/leggings/teen"
copy_layer "legs/leggings/thin" "bottom/leggings/pregnant"
copy_layer "legs/shorts/short_shorts/male" "bottom/short-shorts/male"
copy_layer "legs/shorts/short_shorts/thin" "bottom/short-shorts/female"
copy_layer "legs/shorts/short_shorts/thin" "bottom/short-shorts/teen"
copy_layer "legs/shorts/short_shorts/thin" "bottom/short-shorts/pregnant"
copy_layer "legs/pantaloons/male" "bottom/pantaloons/male"
copy_layer "legs/pantaloons/thin" "bottom/pantaloons/female"
copy_layer "legs/pantaloons/thin" "bottom/pantaloons/teen"
copy_layer "legs/pantaloons/thin" "bottom/pantaloons/pregnant"
copy_layer "legs/leggings2/male" "bottom/leggings2/male"
copy_layer "legs/leggings2/thin" "bottom/leggings2/female"
copy_layer "legs/leggings2/thin" "bottom/leggings2/teen"
copy_layer "legs/leggings2/thin" "bottom/leggings2/pregnant"

copy_layer "feet/shoes/basic/male" "shoes/basic/male"
copy_layer "feet/shoes/basic/thin" "shoes/basic/female"
copy_layer "feet/shoes/basic/thin" "shoes/basic/teen"
copy_layer "feet/shoes/basic/thin" "shoes/basic/pregnant"
copy_layer "feet/boots/basic/male" "shoes/boots/male"
copy_layer "feet/boots/basic/thin" "shoes/boots/female"
copy_layer "feet/boots/basic/thin" "shoes/boots/teen"
copy_layer "feet/boots/basic/thin" "shoes/boots/pregnant"
copy_layer "feet/sandals/male" "shoes/sandals/male"
copy_layer "feet/sandals/thin" "shoes/sandals/female"
copy_layer "feet/sandals/thin" "shoes/sandals/teen"
copy_layer "feet/sandals/thin" "shoes/sandals/pregnant"
copy_layer "feet/boots/fold/male" "shoes/fold-boots/male"
copy_layer "feet/boots/fold/thin" "shoes/fold-boots/female"
copy_layer "feet/boots/fold/thin" "shoes/fold-boots/teen"
copy_layer "feet/boots/fold/thin" "shoes/fold-boots/pregnant"
copy_layer "feet/boots/revised/male" "shoes/revised-boots/male"
copy_layer "feet/boots/revised/thin" "shoes/revised-boots/female"
copy_layer "feet/boots/revised/thin" "shoes/revised-boots/teen"
copy_layer "feet/boots/revised/thin" "shoes/revised-boots/pregnant"
copy_layer "feet/shoes/revised/male" "shoes/revised/male"
copy_layer "feet/shoes/revised/thin" "shoes/revised/female"
copy_layer "feet/shoes/revised/thin" "shoes/revised/teen"
copy_layer "feet/shoes/revised/thin" "shoes/revised/pregnant"
copy_layer "feet/shoes/ghillies/male" "shoes/ghillies/male"
copy_layer "feet/shoes/ghillies/thin" "shoes/ghillies/female"
copy_layer "feet/shoes/ghillies/thin" "shoes/ghillies/teen"
copy_layer "feet/shoes/ghillies/thin" "shoes/ghillies/pregnant"
copy_layer "feet/slippers/male" "shoes/slippers/male"
copy_layer "feet/slippers/thin" "shoes/slippers/female"
copy_layer "feet/slippers/thin" "shoes/slippers/teen"
copy_layer "feet/slippers/thin" "shoes/slippers/pregnant"

# Expand the shop from the hand-curated starter selection. Torso and hat
# sheets provide 100 distinct source silhouettes each. The smaller legs,
# feet, neck, arms and shoulders groups are repeated with different swatches
# in the shared catalog, so every tab still has 100 purchasable SKUs without
# inventing art that is not present in Universal LPC.
copy_profiled_indexed_layers "torso" "shop/top" 100
copy_profiled_indexed_layers "legs" "shop/bottom" 34
copy_profiled_indexed_layers "hat" "shop/hat" 100
copy_profiled_indexed_layers "feet" "shop/shoes" 34
copy_profiled_indexed_layers "neck" "shop/accessory/neck" 21
copy_profiled_indexed_layers "arms" "shop/accessory/arms" 12
copy_profiled_indexed_layers "shoulders" "shop/accessory/shoulders" 10

copy_layer "shadow/adult" "shadow"

# Full-length upstream trouser sheets can stop above the shoe and expose the
# base body at the ankle on one or more frames. Repair only that lower-leg gap
# after importing the original sheets so the preview and Phaser renderer share
# the same corrected assets. Shorts remain intentionally open at the calf.
python3 "$(dirname "$0")/repair-lpc-bottom-coverage.py" \
  --source-root "$repo_dir" \
  --destination-root "$destination_dir"

mkdir -p "$destination_dir/weapon/saber"
cp "$repo_dir/spritesheets/weapon/sword/arming/universal/idle/fg.png" "$destination_dir/weapon/saber/idle.png"
cp "$repo_dir/spritesheets/weapon/sword/arming/universal/walk/fg.png" "$destination_dir/weapon/saber/walk.png"
cp "$repo_dir/spritesheets/weapon/sword/arming/universal/walk/fg.png" "$destination_dir/weapon/saber/run.png"
cp "$repo_dir/spritesheets/weapon/sword/arming/attack_slash/fg.png" "$destination_dir/weapon/saber/slash.png"
cp "$repo_dir/spritesheets/weapon/sword/arming/universal/hurt/fg.png" "$destination_dir/weapon/saber/hurt.png"
cp "$repo_dir/spritesheets/weapon/sword/arming/universal/walk/fg.png" "$destination_dir/weapon/saber/shoot.png"
cp "$repo_dir/spritesheets/weapon/sword/arming/attack_slash/fg.png" "$destination_dir/weapon/saber/thrust.png"
cp "$repo_dir/spritesheets/weapon/sword/arming/universal/idle/fg.png" "$destination_dir/weapon/saber/sit.png"

echo "Imported $(find "$destination_dir" -type f -name '*.png' | wc -l | tr -d ' ') selected LPC layer sheets into $destination_dir"
