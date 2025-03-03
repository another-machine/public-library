import { Geolocation } from "../../../packages/amplib-devices/src";
import { getAstronomicalReport } from "../../../packages/amplib-cosmos/src";
import { createForm } from "../createForm";

type FormData = {
  latitude: number;
  longitude: number;
};

const data = {
  latitude: 0,
  longitude: 0,
  date: Date.now(),
};

export async function example() {
  const section = document.querySelector("section")!;
  const form = section.querySelector("form")!;
  const output = section.querySelector('[data-output="report-output"]')!;
  form.innerHTML = "";

  const { values, setValue } = createForm<FormData>({
    form,
    inputs: {
      latitude: { name: "latitude", type: "number", value: 0 },
      longitude: { name: "longitude", type: "number", value: 0 },
    },
    onInput,
    actions: [{ action: setLocation, name: "Current Location" }],
  });

  async function setLocation() {
    const { latitude, longitude } = await Geolocation.get();
    setValue("latitude", latitude);
    setValue("longitude", longitude);
  }

  onInput(values);
  loop();

  function onInput(formData: FormData) {
    data.latitude = formData.latitude;
    data.longitude = formData.longitude;
  }

  function loop() {
    requestAnimationFrame(loop);
    output.innerHTML = JSON.stringify(
      getAstronomicalReport({ ...data, date: Date.now() }),
      null,
      2
    );
  }
}
