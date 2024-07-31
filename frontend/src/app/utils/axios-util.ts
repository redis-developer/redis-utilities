import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

import { config } from "../config";

interface IApiResponse {
  data: any;
  error: any;
}

const axiosInstance = axios.create({
  baseURL: config.API_BASE_URL,
});

const getRequest = async (
  url: string,
  config?: AxiosRequestConfig
): Promise<AxiosResponse<IApiResponse>> => {
  try {
    const response = await axiosInstance.get(url, config);
    return response;
  } catch (error) {
    console.error("GET request error:", error);
    throw error; //TODO: handle error notification
  }
};

const postRequest = async (
  url: string,
  data: any,
  config?: AxiosRequestConfig
): Promise<AxiosResponse<IApiResponse>> => {
  try {
    const response = await axiosInstance.post(url, data, config);
    return response;
  } catch (error) {
    console.error("POST request error:", error);
    throw error; //TODO: handle error notification
  }
};

export { getRequest, postRequest };
