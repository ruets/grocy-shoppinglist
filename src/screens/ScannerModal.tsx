import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import React from 'react';
import { Linking, Text, Vibration, View } from 'react-native';
import { BigButton, Field, Sheet } from '../components/ui';
import { useColors } from '../theme';
import { t } from '../i18n';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

export function ScannerModal(props: { visible: boolean; onClose: () => void; onScanned: (code: string) => void }) {
  const c = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = React.useState('');
  const locked = React.useRef(false);

  React.useEffect(() => {
    if (props.visible) {
      locked.current = false;
      setManual('');
      if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);

  const handle = (raw: string) => {
    const code = raw.trim();
    if (!code || locked.current) return;
    locked.current = true;
    Vibration.vibrate(80);
    props.onScanned(code);
  };

  const m = t().scanner;
  let camera: React.ReactNode;
  if (!permission) {
    camera = <Text style={{ color: c.muted, fontSize: 16 }}>{m.checkingPermission}</Text>;
  } else if (!permission.granted) {
    camera = (
      <View style={{ gap: 12 }}>
        <Text style={{ color: c.text, fontSize: 16 }}>
          {m.cameraNeeded}
        </Text>
        {permission.canAskAgain ? (
          <BigButton title={m.allowCamera} onPress={requestPermission} />
        ) : (
          <BigButton title={t().common.openSettings} variant="secondary" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  } else {
    camera = (
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        {props.visible ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={(r) => handle(r.data)}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: '10%',
            right: '10%',
            top: '40%',
            height: '20%',
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.85)',
            borderRadius: 12,
          }}
        />
      </View>
    );
  }

  return (
    <Sheet visible={props.visible} title={m.title} onClose={props.onClose}>
      {camera}
      <View style={{ marginTop: 24 }}>
        <Field
          label={m.manualLabel}
          value={manual}
          onChangeText={setManual}
          keyboardType="number-pad"
          placeholder={m.manualPlaceholder}
          returnKeyType="search"
          onSubmitEditing={() => handle(manual)}
        />
        <BigButton title={m.search} variant="secondary" disabled={!manual.trim()} onPress={() => handle(manual)} />
      </View>
    </Sheet>
  );
}
