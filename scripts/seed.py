#!/usr/bin/env python3
"""Seed script for the Native Rebuild Copilot demo.

Generates ALL data used by the demo. Every record is synthetic and fictional:
the React Native components, squads, reviewers, design tokens, pattern library
and golden evaluation checks were written for this demo and do not come from
any real codebase or customer.

Usage:
    python3 scripts/seed.py          # writes data/seed.json and data/seed.js
"""
import json
import random
from pathlib import Path

random.seed(20260930)  # deterministic output

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "seed.json"
OUT_JS = ROOT / "data" / "seed.js"

IMPORT_REACT = "import React from 'react';"
IMPORT_REACT_STATE = "import React, { useState } from 'react';"
IMPORT_REACT_EFFECT = "import React, { useEffect } from 'react';"
IMPORT_TOKENS = "import { colors, spacing, radii, typography } from '@app/design/tokens';"


def rn_import(*names):
    return "import { " + ", ".join(names) + " } from 'react-native';"


# ---------------------------------------------------------------------------
# React Native source components (synthetic "legacy" surfaces to migrate)
# ---------------------------------------------------------------------------
COMPONENTS = [
    {
        "id": "price-alert-toggle",
        "name": "PriceAlertToggle",
        "area": "Alerts",
        "path": "app/features/alerts/PriceAlertToggle.tsx",
        "source": [
            IMPORT_REACT_STATE,
            rn_import("View", "Text", "Switch"),
            IMPORT_TOKENS,
            "",
            "type Props = { assetName: string; threshold: number };",
            "",
            "export function PriceAlertToggle({ assetName, threshold }: Props) {",
            "  const [enabled, setEnabled] = useState(false);",
            "  return (",
            "    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface }}>",
            "      <Text style={{ ...typography.body, color: colors.textPrimary }}>Alert when {assetName} crosses {threshold}</Text>",
            "      <Switch value={enabled} onValueChange={setEnabled} />",
            "    </View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("struct PriceAlertToggle: View", "Declares a SwiftUI view"),
                ("@State private var enabled = false", "Local toggle state"),
                ("HStack(alignment: .center, spacing: DS.Spacing.sm)", "Row layout with token gap"),
                ("Toggle(\"\", isOn: $enabled)", "Switch bound to state"),
                (".background(DS.Color.surface)", "Surface token, not a hard-coded colour"),
            ],
            "kotlin": [
                ("fun PriceAlertToggle(assetName: String, threshold: Double)", "Composable signature"),
                ("var enabled by remember { mutableStateOf(false) }", "Remembered state"),
                ("Switch(checked = enabled, onCheckedChange = { enabled = it })", "Switch wiring"),
                ("DSTheme.colors.surface", "Surface token"),
            ],
        },
    },
    {
        "id": "portfolio-balance-card",
        "name": "PortfolioBalanceCard",
        "area": "Portfolio",
        "path": "app/features/portfolio/PortfolioBalanceCard.tsx",
        "source": [
            IMPORT_REACT,
            rn_import("View", "Text", "Pressable"),
            IMPORT_TOKENS,
            "",
            "type Props = { totalBalance: number; dayChangePct: number; onDeposit: () => void };",
            "",
            "export function PortfolioBalanceCard({ totalBalance, dayChangePct, onDeposit }: Props) {",
            "  return (",
            "    <View style={{ padding: spacing.lg, gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radii.lg }}>",
            "      <Text style={{ ...typography.caption, color: colors.textSecondary }}>Total balance</Text>",
            "      <Text style={{ ...typography.display, color: colors.textPrimary }}>${totalBalance.toFixed(2)}</Text>",
            "      <Text style={{ ...typography.body, color: colors.positive }}>{dayChangePct.toFixed(2)}% today</Text>",
            "      <Pressable onPress={onDeposit} style={{ padding: spacing.sm, backgroundColor: colors.primary, borderRadius: radii.md }}>",
            "        <Text style={{ ...typography.label, color: colors.onPrimary }}>Deposit</Text>",
            "      </Pressable>",
            "    </View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("let onDeposit: () -> Void", "Callback prop typed as closure"),
                ("String(format: \"%.2f\", totalBalance)", "toFixed(2) becomes a format string"),
                ("Button(action: onDeposit)", "Pressable becomes Button"),
                (".clipShape(RoundedRectangle(cornerRadius: DS.Radius.lg))", "Card radius token"),
                (".font(DS.Font.display)", "Typography token"),
            ],
            "kotlin": [
                ("onDeposit: () -> Unit", "Callback prop typed as lambda"),
                ("\"%.2f\".format(totalBalance)", "toFixed(2) becomes format()"),
                (".clickable { onDeposit() }", "Pressable becomes clickable"),
                ("style = DSTheme.typography.display", "Typography token"),
            ],
        },
    },
    {
        "id": "asset-list-screen",
        "name": "AssetListScreen",
        "area": "Trade",
        "path": "app/features/trade/AssetListScreen.tsx",
        "source": [
            IMPORT_REACT_EFFECT,
            rn_import("View", "Text", "FlatList", "ActivityIndicator"),
            IMPORT_TOKENS,
            "import { AssetRow } from './AssetRow';",
            "",
            "type Props = { assets: Asset[]; isLoading: boolean; onRefresh: () => void };",
            "",
            "export function AssetListScreen({ assets, isLoading, onRefresh }: Props) {",
            "  useEffect(() => { onRefresh(); }, []);",
            "  return (",
            "    <View style={{ flex: 1, backgroundColor: colors.background }}>",
            "      <Text style={{ ...typography.title, color: colors.textPrimary, padding: spacing.md }}>Assets</Text>",
            "      {isLoading && <ActivityIndicator />}",
            "      <FlatList data={assets} keyExtractor={(item) => item.id} renderItem={({ item }) => <AssetRow asset={item} />} />",
            "    </View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("let assets: [Asset]", "Array prop"),
                (".task {", "Mount effect becomes .task"),
                ("if isLoading {", "Conditional render"),
                ("List(assets, id: \\.id) { item in", "FlatList becomes List keyed by id"),
                ("ProgressView()", "ActivityIndicator becomes ProgressView"),
            ],
            "kotlin": [
                ("assets: List<Asset>", "List prop"),
                ("LaunchedEffect(Unit) {", "Mount effect becomes LaunchedEffect"),
                ("items(assets, key = { it.id }) { item ->", "FlatList becomes LazyColumn items"),
                ("CircularProgressIndicator()", "ActivityIndicator mapping"),
                (None, "No unmapped TODOs"),
            ],
        },
    },
    {
        "id": "asset-row",
        "name": "AssetRow",
        "area": "Trade",
        "path": "app/features/trade/AssetRow.tsx",
        "source": [
            IMPORT_REACT,
            rn_import("View", "Text", "Image", "Pressable"),
            IMPORT_TOKENS,
            "",
            "type Props = { asset: Asset; onPress: () => void };",
            "",
            "export function AssetRow({ asset, onPress }: Props) {",
            "  return (",
            "    <Pressable onPress={onPress}>",
            "      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md }}>",
            "        <Image source={{ uri: asset.iconUrl }} style={{ width: 32, height: 32 }} />",
            "        <Text style={{ ...typography.body, color: colors.textPrimary, flex: 1 }}>{asset.name}</Text>",
            "        <Text style={{ ...typography.body, color: colors.textSecondary }}>${asset.price.toFixed(2)}</Text>",
            "      </View>",
            "    </Pressable>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("AsyncImage(url: URL(string: asset.iconUrl))", "Remote image"),
                (".frame(width: 32, height: 32)", "Fixed icon size"),
                (".frame(maxWidth: .infinity, alignment: .leading)", "flex: 1 inside a row"),
                ("String(format: \"%.2f\", asset.price)", "Price formatting"),
            ],
            "kotlin": [
                ("AsyncImage(model = asset.iconUrl, contentDescription = null, modifier = Modifier.size(32.dp))", "Remote image"),
                ("Modifier.weight(1f)", "flex: 1 inside a row"),
                ("verticalAlignment = Alignment.CenterVertically", "alignItems: center"),
                ("\"%.2f\".format(asset.price)", "Price formatting"),
            ],
        },
    },
    {
        "id": "send-amount-input",
        "name": "SendAmountInput",
        "area": "Send",
        "path": "app/features/send/SendAmountInput.tsx",
        "source": [
            IMPORT_REACT_STATE,
            rn_import("View", "Text", "TextInput", "Pressable"),
            IMPORT_TOKENS,
            "",
            "type Props = { assetSymbol: string; available: number; onContinue: (amount: string) => void };",
            "",
            "export function SendAmountInput({ assetSymbol, available, onContinue }: Props) {",
            "  const [amount, setAmount] = useState('');",
            "  return (",
            "    <View style={{ padding: spacing.md, gap: spacing.sm }}>",
            "      <Text style={{ ...typography.caption, color: colors.textSecondary }}>Available: {available} {assetSymbol}</Text>",
            "      <TextInput value={amount} onChangeText={setAmount} placeholder=\"0.00\" keyboardType=\"decimal-pad\" />",
            "      {amount.length > 0 && (",
            "        <Pressable onPress={() => onContinue(amount)} style={{ padding: spacing.md, backgroundColor: colors.primary, borderRadius: radii.md }}>",
            "          <Text style={{ ...typography.label, color: colors.onPrimary }}>Continue</Text>",
            "        </Pressable>",
            "      )}",
            "    </View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("TextField(\"0.00\", text: $amount)", "TextInput bound to state"),
                (".keyboardType(.decimalPad)", "Decimal keyboard"),
                ("if amount.count > 0 {", "JS .length becomes .count"),
                ("Button(action: { onContinue(amount) })", "Inline handler"),
            ],
            "kotlin": [
                ("onValueChange = { amount = it }", "TextInput wiring"),
                ("keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)", "Decimal keyboard"),
                ("if (amount.length > 0) {", "Conditional render"),
                (".clickable { onContinue(amount) }", "Inline handler"),
            ],
        },
    },
    {
        "id": "transaction-history-list",
        "name": "TransactionHistoryList",
        "area": "Activity",
        "path": "app/features/activity/TransactionHistoryList.tsx",
        "source": [
            IMPORT_REACT,
            rn_import("View", "Text", "FlatList"),
            IMPORT_TOKENS,
            "import { EmptyState } from '../shared/EmptyState';",
            "import { TransactionRow } from './TransactionRow';",
            "",
            "type Props = { transactions: Transaction[]; filter: string };",
            "",
            "export function TransactionHistoryList({ transactions, filter }: Props) {",
            "  return (",
            "    <View style={{ flex: 1, backgroundColor: colors.background }}>",
            "      <Text style={{ ...typography.title, color: colors.textPrimary, padding: spacing.md }}>History · {filter}</Text>",
            "      {transactions.length === 0 ? <EmptyState message=\"No transactions yet\" /> : <FlatList data={transactions} keyExtractor={(item) => item.id} renderItem={({ item }) => <TransactionRow tx={item} />} />}",
            "    </View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("if transactions.isEmpty {", "Ternary render becomes if/else"),
                ("EmptyState(message: \"No transactions yet\")", "Empty state branch"),
                ("List(transactions, id: \\.id) { item in", "List branch"),
            ],
            "kotlin": [
                ("if (transactions.isEmpty()) {", "Ternary render becomes if/else"),
                ("EmptyState(message = \"No transactions yet\")", "Empty state branch"),
                (None, "No unmapped TODOs"),
            ],
        },
    },
    {
        "id": "watchlist-star",
        "name": "WatchlistStar",
        "area": "Watchlist",
        "path": "app/features/watchlist/WatchlistStar.tsx",
        "source": [
            IMPORT_REACT_STATE,
            rn_import("Text", "Pressable"),
            IMPORT_TOKENS,
            "",
            "type Props = { assetId: string; initiallyStarred: boolean };",
            "",
            "export function WatchlistStar({ assetId, initiallyStarred }: Props) {",
            "  const [starred, setStarred] = useState(initiallyStarred);",
            "  return (",
            "    <Pressable onPress={() => setStarred(!starred)} style={{ padding: spacing.xs }}>",
            "      <Text style={{ ...typography.title, color: colors.accent }}>{starred ? '★' : '☆'}</Text>",
            "    </Pressable>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("@State private var starred: Bool", "State seeded from a prop needs an explicit type"),
                ("_starred = State(initialValue: initiallyStarred)", "Initialise @State in init"),
                ("Button(action: { starred = !starred })", "Setter call becomes assignment"),
            ],
            "kotlin": [
                ("var starred by remember { mutableStateOf(initiallyStarred) }", "Remembered state from prop"),
                ("if (starred) \"★\" else \"☆\"", "Ternary becomes if-expression"),
                (".clickable { starred = !starred }", "Setter call becomes assignment"),
            ],
        },
    },
    {
        "id": "recurring-buy-schedule",
        "name": "RecurringBuySchedule",
        "area": "Recurring buys",
        "path": "app/features/recurring/RecurringBuySchedule.tsx",
        "source": [
            IMPORT_REACT,
            rn_import("ScrollView", "Text"),
            IMPORT_TOKENS,
            "import { FrequencyChip } from './FrequencyChip';",
            "",
            "type Props = { assetSymbol: string; frequency: string; onChangeFrequency: (f: string) => void };",
            "",
            "export function RecurringBuySchedule({ assetSymbol, frequency, onChangeFrequency }: Props) {",
            "  return (",
            "    <ScrollView>",
            "      <Text style={{ ...typography.title, color: colors.textPrimary, padding: spacing.md }}>Recurring buy · {assetSymbol}</Text>",
            "      <FrequencyChip label=\"Daily\" selected={frequency === 'daily'} onPress={() => onChangeFrequency('daily')} />",
            "      <FrequencyChip label=\"Weekly\" selected={frequency === 'weekly'} onPress={() => onChangeFrequency('weekly')} />",
            "      <FrequencyChip label=\"Monthly\" selected={frequency === 'monthly'} onPress={() => onChangeFrequency('monthly')} />",
            "    </ScrollView>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("ScrollView {", "ScrollView mapping"),
                ("FrequencyChip(label: \"Daily\", selected: frequency == \"daily\", onPress: { onChangeFrequency(\"daily\") })", "Custom component call"),
                ("let onChangeFrequency: (String) -> Void", "Typed callback"),
            ],
            "kotlin": [
                ("Modifier.verticalScroll(rememberScrollState())", "ScrollView mapping"),
                ("FrequencyChip(label = \"Weekly\", selected = frequency == \"weekly\", onPress = { onChangeFrequency(\"weekly\") })", "Custom component call"),
                ("onChangeFrequency: (String) -> Unit", "Typed callback"),
            ],
        },
    },
    {
        "id": "staking-rewards-banner",
        "name": "StakingRewardsBanner",
        "area": "Earn",
        "path": "app/features/earn/StakingRewardsBanner.tsx",
        "source": [
            IMPORT_REACT_EFFECT,
            rn_import("View", "Text", "Image", "Pressable"),
            IMPORT_TOKENS,
            "import { trackImpression } from '@app/analytics';",
            "",
            "type Props = { assetId: string; apy: number; isEligible: boolean; onLearnMore: () => void };",
            "",
            "export function StakingRewardsBanner({ assetId, apy, isEligible, onLearnMore }: Props) {",
            "  useEffect(() => { trackImpression(assetId); }, [assetId]);",
            "  return (",
            "    <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceAccent, borderRadius: radii.lg }}>",
            "      <Image source={{ uri: 'https://cdn.example.test/staking.png' }} style={{ width: 40, height: 40 }} />",
            "      <View style={{ flex: 1, gap: spacing.xs }}>",
            "        <Text style={{ ...typography.label, color: colors.textPrimary }}>Earn up to {apy.toFixed(1)}% APY</Text>",
            "        {isEligible && (",
            "          <Pressable onPress={onLearnMore}>",
            "            <Text style={{ ...typography.caption, color: colors.primary }}>Learn more</Text>",
            "          </Pressable>",
            "        )}",
            "      </View>",
            "    </View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                (".task(id: assetId) {", "Effect keyed on assetId"),
                ("String(format: \"%.1f\", apy)", "APY formatting"),
                ("DS.Color.surfaceAccent", "Accent surface token"),
                ("if isEligible {", "Conditional CTA"),
            ],
            "kotlin": [
                ("LaunchedEffect(assetId) {", "Effect keyed on assetId"),
                ("\"%.1f\".format(apy)", "APY formatting"),
                ("if (isEligible) {", "Conditional CTA"),
                ("Modifier.weight(1f)", "flex: 1 column"),
            ],
        },
    },
    {
        "id": "security-settings-screen",
        "name": "SecuritySettingsScreen",
        "area": "Settings",
        "path": "app/features/settings/SecuritySettingsScreen.tsx",
        "source": [
            IMPORT_REACT_STATE,
            rn_import("ScrollView", "View", "Text", "Switch"),
            IMPORT_TOKENS,
            "",
            "export function SecuritySettingsScreen() {",
            "  const [biometrics, setBiometrics] = useState(true);",
            "  const [txAlerts, setTxAlerts] = useState(false);",
            "  return (",
            "    <ScrollView>",
            "      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }}>",
            "        <Text style={{ ...typography.body, color: colors.textPrimary }}>Unlock with biometrics</Text>",
            "        <Switch value={biometrics} onValueChange={setBiometrics} />",
            "      </View>",
            "      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }}>",
            "        <Text style={{ ...typography.body, color: colors.textPrimary }}>Transaction alerts</Text>",
            "        <Switch value={txAlerts} onValueChange={setTxAlerts} />",
            "      </View>",
            "    </ScrollView>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("@State private var biometrics = true", "First toggle state"),
                ("Spacer()", "space-between needs a Spacer"),
                ("Toggle(\"\", isOn: $txAlerts)", "Second toggle"),
            ],
            "kotlin": [
                ("horizontalArrangement = Arrangement.SpaceBetween", "space-between arrangement"),
                ("Switch(checked = biometrics, onCheckedChange = { biometrics = it })", "First switch"),
                ("fun SecuritySettingsScreen()", "No-arg composable"),
            ],
        },
    },
    {
        "id": "price-chart-header",
        "name": "PriceChartHeader",
        "area": "Trade",
        "path": "app/features/trade/PriceChartHeader.tsx",
        "source": [
            "import React, { useMemo } from 'react';",
            rn_import("Animated", "Text"),
            IMPORT_TOKENS,
            "import { computeChange } from './math';",
            "",
            "type Props = { assetName: string; prices: number[]; fadeAnim: Animated.Value };",
            "",
            "export function PriceChartHeader({ assetName, prices, fadeAnim }: Props) {",
            "  const change = useMemo(() => computeChange(prices), [prices]);",
            "  return (",
            "    <Animated.View style={{ padding: spacing.md, opacity: fadeAnim }}>",
            "      <Text style={{ ...typography.title, color: colors.textPrimary }}>{assetName}</Text>",
            "      <Text style={{ ...typography.body, color: change >= 0 ? colors.positive : colors.negative }}>{change.toFixed(2)}%</Text>",
            "    </Animated.View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("private var change: Double { computeChange(prices) }", "useMemo becomes a computed property"),
                (".opacity(", "Animated opacity"),
                ("change >= 0 ? DS.Color.positive : DS.Color.negative", "Conditional colour tokens"),
            ],
            "kotlin": [
                ("val change = remember(prices) { computeChange(prices) }", "useMemo becomes remember(key)"),
                ("Modifier.alpha(", "Animated opacity"),
                ("if (change >= 0) DSTheme.colors.positive else DSTheme.colors.negative", "Conditional colour tokens"),
            ],
        },
    },
    {
        "id": "onboarding-welcome",
        "name": "OnboardingWelcome",
        "area": "Onboarding",
        "path": "app/features/onboarding/OnboardingWelcome.tsx",
        "source": [
            IMPORT_REACT,
            rn_import("View", "Text", "Pressable"),
            IMPORT_TOKENS,
            "",
            "type Props = { firstName: string; onGetStarted: () => void };",
            "",
            "export function OnboardingWelcome({ firstName, onGetStarted }: Props) {",
            "  return (",
            "    <View style={{ padding: spacing.xl, gap: spacing.md, backgroundColor: colors.background }}>",
            "      <Text style={{ ...typography.display, color: colors.textPrimary }}>Welcome, {firstName}</Text>",
            "      <Text style={{ ...typography.body, color: colors.textSecondary }}>Your account is ready. Let's set up your first recurring buy.</Text>",
            "      <Pressable onPress={onGetStarted} style={{ padding: spacing.md, backgroundColor: colors.primary, borderRadius: radii.md }}>",
            "        <Text style={{ ...typography.label, color: colors.onPrimary }}>Get started</Text>",
            "      </Pressable>",
            "    </View>",
            "  );",
            "}",
        ],
        "golden": {
            "swift": [
                ("Text(\"Welcome, \\(firstName)\")", "String interpolation"),
                ("VStack(alignment: .leading, spacing: DS.Spacing.md)", "Column with token gap"),
                ("Button(action: onGetStarted)", "CTA button"),
            ],
            "kotlin": [
                ("Text(text = \"Welcome, $firstName\"", "String template"),
                ("verticalArrangement = Arrangement.spacedBy(DSTheme.spacing.md)", "Column gap token"),
                ("DSTheme.colors.primary", "Primary token"),
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Design-system tokens (fictional)
# ---------------------------------------------------------------------------
COLOR_TOKENS = {
    "background": "#FFFFFF", "surface": "#F4F6FA", "surfaceAccent": "#E8EEFF",
    "primary": "#1F4FE0", "onPrimary": "#FFFFFF", "textPrimary": "#0B0E14",
    "textSecondary": "#5A6372", "positive": "#0F8A5F", "negative": "#C8323C",
    "accent": "#F2A100",
}
SPACING_TOKENS = {"xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32}
RADII_TOKENS = {"md": 8, "lg": 16}
TYPE_TOKENS = {
    "display": "32/40 semibold", "title": "22/28 semibold", "body": "16/22 regular",
    "label": "15/20 medium", "caption": "13/18 regular",
}

TOKENS = []
for k, v in COLOR_TOKENS.items():
    TOKENS.append({"id": f"TOK-color-{k}", "rn": f"colors.{k}", "swift": f"DS.Color.{k}", "kotlin": f"DSTheme.colors.{k}", "value": v, "kind": "color"})
for k, v in SPACING_TOKENS.items():
    TOKENS.append({"id": f"TOK-spacing-{k}", "rn": f"spacing.{k}", "swift": f"DS.Spacing.{k}", "kotlin": f"DSTheme.spacing.{k}", "value": f"{v}pt", "kind": "spacing"})
for k, v in RADII_TOKENS.items():
    TOKENS.append({"id": f"TOK-radius-{k}", "rn": f"radii.{k}", "swift": f"DS.Radius.{k}", "kotlin": f"DSTheme.radii.{k}", "value": f"{v}pt", "kind": "radius"})
for k, v in TYPE_TOKENS.items():
    TOKENS.append({"id": f"TOK-type-{k}", "rn": f"typography.{k}", "swift": f"DS.Font.{k}", "kotlin": f"DSTheme.typography.{k}", "value": v, "kind": "typography"})

# ---------------------------------------------------------------------------
# Translation pattern library (fictional, "human-reviewed" migration patterns)
# ---------------------------------------------------------------------------
REVIEWERS = ["R. Okafor", "M. Lindqvist", "S. Patel", "J. Moreau", "A. Tanaka", "D. Haddad"]

RULES_RAW = [
    # id, tier, title, rn, swift, kotlin, rationale
    ("R-IMPORT-REACT", "core", "React import", "import React from 'react'", "(none)", "import androidx.compose.runtime.*", "Compose runtime provides state primitives; SwiftUI needs no React equivalent."),
    ("R-IMPORT-RN", "core", "react-native import", "import { View } from 'react-native'", "import SwiftUI", "import androidx.compose.foundation.layout.* / material3.*", "Platform UI toolkit import."),
    ("R-IMPORT-TOKENS", "core", "Design-token import", "import { colors } from '@app/design/tokens'", "import DesignSystem", "import com.example.designsystem.DSTheme", "Tokens live in the shared native design-system module."),
    ("R-IMPORT-LOCAL", "core", "Sibling module import", "import { AssetRow } from './AssetRow'", "(same module)", "(same package)", "Same-feature components share a module/package natively."),
    ("R-PROPS-TYPE", "core", "Props type alias", "type Props = { a: string }", "let a: String", "a: String (parameter)", "TS types map to Swift/Kotlin types: string→String, number→Double, boolean→Bool/Boolean, T[]→[T]/List<T>, () => void→() -> Void/Unit."),
    ("R-COMPONENT", "core", "Function component", "export function X(props) {", "struct X: View {", "@Composable fun X(...) {", "Function components become SwiftUI views and composable functions."),
    ("R-STATE", "core", "useState hook", "const [v, setV] = useState(x)", "@State private var v = x", "var v by remember { mutableStateOf(x) }", "Local UI state; setter calls become assignments."),
    ("R-RENDER-RETURN", "core", "Render return", "return ( ... );", "var body: some View { ... }", "(composable body)", "JSX root becomes the view body."),
    ("R-BLOCK-CLOSE", "core", "Block close", "}", "}", "}", "Structural close of component scope."),
    ("R-VIEW-COLUMN", "core", "View (column)", "<View>", "VStack(alignment: .leading, spacing: …)", "Column(...)", "RN default flexDirection is column."),
    ("R-VIEW-ROW", "core", "View (row)", "<View style={{ flexDirection: 'row' }}>", "HStack(...)", "Row(...)", "Row layouts map to horizontal stacks."),
    ("R-SCROLLVIEW", "core", "ScrollView", "<ScrollView>", "ScrollView { }", "Column(Modifier.verticalScroll(rememberScrollState()))", "Vertical scroll container."),
    ("R-TEXT", "core", "Text", "<Text>Hi {name}</Text>", "Text(\"Hi \\(name)\")", "Text(text = \"Hi $name\")", "JSX interpolation becomes native string interpolation."),
    ("R-PRESSABLE", "core", "Pressable", "<Pressable onPress={f}>", "Button(action: f) { }", "Box(Modifier.clickable { f() })", "Tap targets; style applies to the button container."),
    ("R-SWITCH", "core", "Switch", "<Switch value={v} onValueChange={setV} />", "Toggle(\"\", isOn: $v)", "Switch(checked = v, onCheckedChange = { v = it })", "Two-way binding to state."),
    ("R-TEXTINPUT", "core", "TextInput", "<TextInput value={v} onChangeText={setV} />", "TextField(\"…\", text: $v)", "OutlinedTextField(value = v, onValueChange = { v = it })", "Controlled text input."),
    ("R-ACTIVITY", "core", "ActivityIndicator", "<ActivityIndicator />", "ProgressView()", "CircularProgressIndicator()", "Indeterminate spinner."),
    ("R-CUSTOM-COMPONENT", "core", "Custom component call", "<Row a={b} />", "Row(a: b)", "Row(a = b)", "JSX props become labelled / named arguments."),
    ("R-STYLE-BOX", "core", "Box style props", "padding, backgroundColor, borderRadius, width, height, gap, alignItems", ".padding / .background / .clipShape / .frame", "Modifier.padding / background / clip / size", "Compose modifier order: clip → background → clickable → padding."),
    ("R-STYLE-TEXT", "core", "Text style props", "...typography.x, color", ".font / .foregroundColor", "style = … , color = …", "Typography spreads map to font tokens."),
    ("R-EFFECT", "extended", "useEffect hook", "useEffect(() => { f(); }, [dep])", ".task(id: dep) { f() }", "LaunchedEffect(dep) { f() }", "Retrieved from migrated examples MIG-104, MIG-131. Empty deps = run on appear."),
    ("R-FLATLIST", "extended", "FlatList", "<FlatList data={xs} keyExtractor={(i) => i.id} renderItem={...} />", "List(xs, id: \\.id) { item in … }", "LazyColumn { items(xs, key = { it.id }) { item -> … } }", "Retrieved from migrated examples MIG-109, MIG-140. Lazy lists keyed by stable id."),
    ("R-IMAGE", "extended", "Remote Image", "<Image source={{ uri }} />", "AsyncImage(url: URL(string: uri))", "AsyncImage(model = uri, contentDescription = null)", "Retrieved from MIG-112. Uses the platform async image loader."),
    ("R-COND-RENDER", "extended", "Conditional render (&&)", "{cond && <X />}", "if cond { X() }", "if (cond) { X() }", "Retrieved from MIG-118. Short-circuit JSX becomes an if-block."),
    ("R-NUMBER-FORMAT", "extended", "Number.toFixed", "n.toFixed(2)", "String(format: \"%.2f\", n)", "\"%.2f\".format(n)", "Retrieved from MIG-121. Fixed-precision formatting."),
    ("R-LAYOUT-FLEX", "extended", "flex: 1", "style={{ flex: 1 }}", ".frame(maxWidth: .infinity …)", "Modifier.weight(1f) / fillMaxSize()", "Retrieved from MIG-126. Fill remaining space."),
    ("R-LAYOUT-SPACE-BETWEEN", "extended", "justifyContent: space-between", "justifyContent: 'space-between'", "Spacer() between children", "Arrangement.SpaceBetween", "Retrieved from MIG-133."),
    ("R-STATE-FROM-PROP", "extended", "State seeded from prop", "useState(initialProp)", "@State var v: T + init { _v = State(initialValue:) }", "remember { mutableStateOf(initialProp) }", "Swift cannot reference self in a property initialiser; agent emits an explicit init."),
    ("R-KEYBOARD-TYPE", "extended", "keyboardType", "keyboardType=\"decimal-pad\"", ".keyboardType(.decimalPad)", "KeyboardOptions(keyboardType = KeyboardType.Decimal)", "Retrieved from MIG-137."),
]

RULES = []
for rid, tier, title, rn, sw, kt, why in RULES_RAW:
    RULES.append({
        "id": rid, "tier": tier, "title": title, "rn": rn, "swift": sw, "kotlin": kt,
        "rationale": why, "reviewedBy": random.choice(REVIEWERS),
        "approvedMigrations": random.randint(3, 41),
    })

KNOWN_GAPS = [
    {"id": "GAP-TERNARY-RENDER", "pattern": "{cond ? <A /> : <B />}", "note": "No reviewed pattern yet; route to human review."},
    {"id": "GAP-USEMEMO", "pattern": "useMemo(() => …, [deps])", "note": "Needs a computed-property / remember(key) pattern."},
    {"id": "GAP-ANIMATED", "pattern": "Animated.View / Animated.Value", "note": "Animation APIs differ per platform; needs a human decision."},
]

CONFIGS = [
    {
        "id": "cfg-baseline", "name": "Baseline · single-pass rules",
        "description": "One pass over the file using core rules only. No retrieval, no token lookup, no verification.",
        "tiers": ["core"], "tokenRetrieval": False, "selfCheck": False,
    },
    {
        "id": "cfg-tokens", "name": "Rules + design-token retrieval",
        "description": "Core rules plus lookup of every style value in the design-token registry.",
        "tiers": ["core"], "tokenRetrieval": True, "selfCheck": False,
    },
    {
        "id": "cfg-agentic", "name": "Agentic · pattern retrieval + tokens + self-check",
        "description": "Plans the file, retrieves extended patterns from the reviewed migration library, resolves tokens, then self-checks output (brace balance, bindings, unmapped lines) and routes gaps to human review.",
        "tiers": ["core", "extended"], "tokenRetrieval": True, "selfCheck": True,
    },
]

SQUADS = {
    "Alerts": "Notifications squad", "Portfolio": "Portfolio squad", "Trade": "Trade squad",
    "Send": "Payments squad", "Activity": "Portfolio squad", "Watchlist": "Trade squad",
    "Recurring buys": "Payments squad", "Earn": "Earn squad", "Settings": "Identity squad",
    "Onboarding": "Identity squad",
}


def build():
    surfaces = []
    for c in COMPONENTS:
        golden = []
        n = 0
        for platform in ("swift", "kotlin"):
            for expect, label in c["golden"][platform]:
                n += 1
                golden.append({
                    "id": f"{c['id']}-{platform}-{n}",
                    "platform": platform,
                    "type": "noTodo" if expect is None else "contains",
                    "expect": expect,
                    "label": label,
                })
        surfaces.append({
            "id": c["id"], "name": c["name"], "area": c["area"], "path": c["path"],
            "squad": SQUADS[c["area"]],
            "dailyViews": random.randint(40, 900) * 1000,
            "priority": random.choice(["P0", "P1", "P1", "P2"]),
            "source": "\n".join(c["source"]),
            "golden": golden,
        })
    return {
        "meta": {
            "title": "Native Rebuild Copilot",
            "disclaimer": "Unofficial demo built with Devin - synthetic data",
            "generatedBy": "scripts/seed.py",
            "seed": 20260930,
        },
        "surfaces": surfaces,
        "tokens": TOKENS,
        "rules": RULES,
        "gaps": KNOWN_GAPS,
        "configs": CONFIGS,
    }


def main():
    data = build()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2, ensure_ascii=False)
    OUT_JSON.write_text(text + "\n", encoding="utf-8")
    OUT_JS.write_text("// Generated by scripts/seed.py - do not edit by hand.\nwindow.SEED = " + text + ";\n", encoding="utf-8")
    n_checks = sum(len(s["golden"]) for s in data["surfaces"])
    print(f"Wrote {len(data['surfaces'])} surfaces, {len(TOKENS)} tokens, {len(RULES)} rules, {n_checks} golden checks")


if __name__ == "__main__":
    main()
